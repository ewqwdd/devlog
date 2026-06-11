# DevLog — Design Doc

Engineering-team task tracker with an AI layer. This document captures the
**what** and **why**. Code conventions, stack list, and run commands live in
`CLAUDE.md`. Feature-level detail lives in `specs/<feature>/`.

## 1. Context & problem

An engineering team tracks work in DevLog. Each task has a title, description,
status, and priority. The friction is manual: deciding what to do next, breaking
tasks into subtasks, and writing status updates for teammates. The base tracker
solves storage and CRUD; the AI layer removes the friction with agents that
reason over the current board state instead of answering one-shot prompts.

## 2. Goals / non-goals

### Goals

- A working kanban CRUD tracker for a single team / single user, local only.
- An AI layer with real multi-step agents (not single LLM calls): a tool-using
  chat agent, a prioritization sub-agent, AI task decomposition, and an automatic
  status-update generator.
- Everything runs with `npm install && npm run dev`. No deploy, no auth.

### Non-goals

- Authentication, multi-user, roles, permissions.
- Deployment / hosting.
- Persistent chat history (lost on reload — see §3).
- Real-time multi-client collaboration.
- Infinite subtask nesting (one level only, Asana-style).

## 3. Architecture (shape & boundaries)

- Single Next.js (App Router) process. UI (kanban + chat + status log) →
  Server Actions / Route Handlers → service layer → Drizzle → SQLite. The service
  layer is the only path to data (per `CLAUDE.md`).
- AI agents reach data only through the same services as the UI. Tools are
  thin wrappers over service functions — no separate data path for the agent.
- Chat runs fully on the Vercel AI SDK. Streaming, the multi-step tool-calling
  loop, and client message state are all handled by the SDK (`useChat` on the
  client, `streamText` + tools in a Route Handler). Transport is HTTP streaming
  over the single Next process — no WebSocket, no custom server, `npm run dev`
  stays clean.
- Chat history is client-held (AI SDK default). `useChat` keeps the message
  array and sends it with each request; the server is stateless about history.
  No in-memory store, no Zustand for chat. History is lost on reload — acceptable
  for an MVP, documented in the README.

> **Rejected alternative:** server-side history would defend against a client
> forging "assistant" turns into the LLM context. That threat needs an
> untrusted client; this app is local, single-user, no auth, so it doesn't
> apply, and client-held is the simpler, idiomatic choice. (If persistence were
> ever needed, the AI SDK supports sending only the last message + a chat id and
> loading history server-side.)

## 4. Data model (Drizzle / SQLite)

Three tables: `tasks`, `subtasks`, `status_updates`.

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['todo', 'in-progress', 'done'] })
    .notNull().default('todo'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] })
    .notNull().default('medium'),
  position: integer('position').notNull().default(0), // order within its column
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  position: integer('position').notNull().default(0), // order within a task
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
});

export const statusUpdates = sqliteTable('status_updates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});
```

## 5. Product functionality

### 5.1 Task CRUD + kanban

- Full CRUD: create, read, edit, delete.
- Board with three columns = the three statuses (`todo`, `in-progress`, `done`).
- Drag-and-drop (dnd-kit) supports both moving a card between columns (changes
  `status`) and reordering within a column (changes `position`); a cross-column
  drop updates both. Optimistic update via React Query mutation; persisted via
  Server Action.
- Cards in a column are ordered by `position`. New tasks append to the bottom of
  their column (`max(position) + 1`); on reorder, the affected column is renumbered.
- Click a card → full-screen modal to view and edit.
- "New task" button (top-right) → modal with a create form.
- Delete from the card / modal.

### 5.2 Subtasks

- One level only (a task has many subtasks; subtasks have no subtasks).
- Fields: title, description, position, done. No priority.
- Shown and managed inside the task modal.

## 6. AI / agent design

Four AI features. The chat agent and prioritization agent are the core
(genuinely multi-step, agent-invoking-agent). Decomposition and the status
generator are built after the core works.

### 6.1 Chat agent — (own idea, feature D)

- A pinned chat panel to the right of the board, built on the Vercel AI SDK:
  `useChat` (client) ↔ a `streamText` Route Handler (`@ai-sdk/anthropic`) that
  runs the multi-step tool loop server-side.
- Tools (thin wrappers over services, zod-typed):
  `listTasks(filter)`, `createTask`, `editTask`, `deleteTask`, and
  `runPrioritization` (invokes the prioritization sub-agent, §6.2).
- Genuinely agentic: e.g. "create a task to refactor auth, high priority" → the
  agent calls `createTask` and confirms; "what should I start with?" → the agent
  calls `runPrioritization`.
- After any agent mutation, the board's React Query cache is invalidated so the
  UI reflects it (chat and board share the same data).

### 6.2 Prioritization agent — (feature A)

- A separate agent, exposed to the chat agent as the `runPrioritization` tool
  (and triggerable on its own). Requires no user input.
- Tool: `listTasks`.
- Logic: look at `in-progress` first — if any exist, recommend finishing
  those. If none, analyze `todo` by age (how long since `createdAt`), priority,
  and content (importance / complexity) and recommend what to start the day with,
  with reasoning. If everything is done, say there are no tasks.
- Implemented as a tool whose `execute` runs its own AI SDK `generateText` call
  with the `listTasks` tool — an agent invoked by an agent.
- The prompt is written separately (prompt engineering); this section fixes only
  the behavior and the tool surface.

### 6.3 Task decomposition — (feature B)

- Inside the task modal, a "Decompose" button.
- If the task is vague/underspecified, the agent first asks a clarifying
  question before generating (matches the assignment spec; keeps it multi-step,
  not a blind one-shot).
- Otherwise: a single AI SDK `generateObject` call (zod schema) returns the
  subtasks → autofills the subtask form → the user edits/confirms (or adds
  subtasks manually). It is form auto-fill, not silent creation.

### 6.4 Status-update generator — (feature C)

- Triggered when a card is moved to `done`. The backend catches the
  `status → done` transition and passes the `taskId` to the agent.
- The agent fetches the task + its subtasks, writes a short status update
  describing what was done (Slack-style tone), and surfaces the next highest
  priority. Stored as a `status_updates` row linked to the task.
- A dedicated Status Log page lists status updates.

## 7. Key decisions (decision → why → tradeoff)

- **HTTP streaming (via the AI SDK) over WebSocket.** LLM streaming is one-way and
  needs no custom server, keeping `npm run dev` clean. Tradeoff: no server-push,
  which this app doesn't need.
- **Client-held chat history (AI SDK default), no persistence.** `useChat` owns
  the messages; no server store, no Zustand for chat. The forged-history concern
  needs an untrusted client and doesn't apply to a local single-user app.
  Tradeoff: history lost on reload.
- **SQLite + Drizzle.** Zero-infra persistence; type-safe data layer + migrations.
  Tradeoff: single writer, no concurrency/scale — would move to Postgres for
  multi-user.
- **Vercel AI SDK (Anthropic provider) for the entire AI layer.** One SDK for
  everything: `useChat`/`streamText` for the chat agent, `generateText` for the
  prioritization and status agents, `generateObject` for decomposition.
  Tradeoff: one abstraction layer, but a single consistent surface, less code
  to hand-roll, and built-in mock-model utilities for the `MOCK_LLM` toggle.
- **One-level subtasks (no deeper nesting).** Matches real trackers (Asana).
  Tradeoff: no deep breakdowns.
- **Manual card order via integer `position`, renumbered per column on reorder.**
  Simple and correct for small boards. Tradeoff: O(n) writes per reorder; a
  fractional-rank scheme would avoid that but isn't needed at this scale.
- **`MOCK_LLM` toggle.** Real calls with the reviewer's keys; a mock model
  (AI SDK test utilities) locally so development doesn't burn keys. In
  `.env.example`.

## 8. Out of scope

Auth, multi-user, deploy, persistent chat history, real-time collaboration,
infinite subtask nesting.
