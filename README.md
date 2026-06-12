# DevLog

An engineering task tracker (kanban) with a real AI layer: a tool-using chat
agent, a prioritization sub-agent, and AI task decomposition. Single user,
local-only, runs entirely with `npm run dev`.

This is a take-home project. The sections below describe **what was built**,
**which technologies were chosen and why**, and **how to run and verify it**.

---

## What was built

| Feature | Where to see it | Notes |
| --- | --- | --- |
| **Kanban CRUD** | Board at `/` | Three columns (`todo` / `in-progress` / `done`); create, edit, delete tasks. |
| **Drag-and-drop** | Board | Move a card between columns (changes status) and reorder within a column (changes position); optimistic update, persisted via Server Action. |
| **Task modal** | Click a card → `/tasks/[id]` (intercepting-route modal, with a full-page fallback) | View / edit a task; `New task` button → `/tasks/new`. |
| **Subtasks** | Inside the task modal | One level only (Asana-style): add, edit, toggle done, reorder, delete. |
| **AI chat agent** | Panel pinned right of the board | Vercel AI SDK multi-step tool loop. Tools wrap the same services the UI uses: `listTasks`, `createTask`, `editTask`, `deleteTask`, `runPrioritization`. After any agent mutation the board refreshes (shared React Query cache). e.g. *"create a task to refactor auth, high priority"*. |
| **Prioritization agent** | `Prioritize` button (top bar) and the chat (*"what should I start with?"*) | A real sub-agent: a tool whose `execute` runs its **own** `generateText` loop with its own `listTasks` tool — an agent invoked by an agent. In-progress first; otherwise reasons over `todo` by age / priority / content; otherwise says there's nothing to do. |
| **AI decomposition** | `Decompose` button in the task modal | Vague task → the agent asks a clarifying question first. Clear task → `generateObject` (zod schema) **auto-fills** the subtask form for the user to edit and confirm. Auto-fill, never silent creation. |
| **Offline mock mode** | `MOCK_LLM=1` | A scripted mock model drives every AI flow deterministically with no API key (see *Running*). |

The full product spec and design rationale live in
[`docs/DESIGN.md`](docs/DESIGN.md); the build order and per-phase checkpoints in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Tech stack & why

- **Next.js (App Router) + TypeScript (strict)** — one process serves UI, Server
  Actions, and the chat Route Handler; no separate backend to run. Strict TS
  (`no any`, explicit return types) keeps a multi-session AI-assisted codebase
  consistent.
- **Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)** — a single SDK for the entire AI
  layer: `streamText` + the multi-step tool loop for chat, `generateText` for the
  prioritization sub-agent, `generateObject` for decomposition. Its test utilities
  give a real `MockLanguageModelV2`, which is what makes `MOCK_LLM` mode possible.
- **Anthropic `claude-haiku-4-5`** (default, overridable via `ANTHROPIC_MODEL`) —
  fast and cheap enough for an interactive multi-step tool loop.
- **Drizzle ORM + SQLite (`better-sqlite3`)** — zero-infra, file-based persistence
  with a type-safe schema and real migrations. No DB server to provision for a
  local single-user app. (Would move to Postgres for multi-user.)
- **React Query (TanStack)** — owns board data on the client: optimistic
  drag-and-drop updates and cache invalidation so chat-driven mutations show up on
  the board without a reload.
- **dnd-kit** — accessible drag-and-drop for the kanban board.
- **Tailwind v4 + shadcn/ui (Radix)** — composable, accessible primitives; UI is
  assembled from `shared/ui/` components rather than hand-rolled markup.
- **zod v4** — every external input (Server Actions, the chat Route Handler) is
  validated at the boundary before any business logic runs.
- **pino** — structured logging instead of `console.log`.
- **Vitest + Playwright** — unit/integration against a temp SQLite file; e2e drives
  the real app with the mock model (`MOCK_LLM=1`) over an isolated database.
- **Biome** — single tool for lint + format (no ESLint/Prettier split).

The architecture is layered — `controller (Server Actions / route handlers) →
use-case → service → repository → infra` — with dependencies pointing downward
only. AI tools reach data through the **same services** as the UI, never a
separate path. The conventions enforced across the codebase are in
[`CLAUDE.md`](CLAUDE.md).

```
app/        pages, layouts, route handlers, Server Actions (controller layer)
components/ domain components reused across pages (e.g. TaskCard)
use-cases/  orchestration across multiple services (e.g. chat agent, decomposition)
services/   business logic per module
shared/repositories/  the only layer that talks to storage
shared/infra/         DB connection, Anthropic/LLM clients (no business logic)
shared/ui/            portable shadcn/ui primitives
shared/hooks/         TanStack Query hooks (one per query key)
shared/lib/           logger, helpers, constants
shared/types/         types shared across modules
```

---

## Running the project

### Prerequisites

- Node.js 20+ and npm.

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your env file from the template
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env

# 3. Create the SQLite database and apply migrations
#    (the db file is git-ignored, so a fresh clone has none yet)
npm run db:migrate

# 4. Start the app
npm run dev
```

Open <http://localhost:3000>.

### `MOCK_LLM` — running the AI offline vs. for real

The AI layer has two modes, controlled by `MOCK_LLM` in `.env`:

- **`MOCK_LLM=1` (the default in `.env.example`)** — a scripted mock model drives
  every AI flow deterministically. **No API key required.** Use this to exercise
  the chat, prioritization, and decomposition flows offline. Responses are fixed
  (e.g. decomposition returns a set list of subtasks; a task whose title contains
  *"vague"* triggers the clarifying-question path), so this verifies wiring, not
  reasoning quality.

- **Real Anthropic calls** — set `ANTHROPIC_API_KEY=...` and set `MOCK_LLM=0`
  (or remove the line). The model defaults to `claude-haiku-4-5` and can be changed
  with `ANTHROPIC_MODEL`. This is the mode to evaluate genuine agent behaviour.

### Verifying it works

Static checks and the full test suite (this is exactly what CI-style review would
run):

```bash
npm run typecheck     # tsc --noEmit (strict)
npm run lint          # Biome check + a guard against stray @ts-ignore directives
npm run test          # Vitest unit/integration (temp SQLite per run)
npm run test:e2e      # Playwright; starts its own dev server with MOCK_LLM=1 on an isolated DB
```

Things to try by hand in the browser:

- **Offline (`MOCK_LLM=1`):** in the chat panel, send `create: Buy milk` → a card
  appears on the board without a reload. Click `Prioritize`. Open a task → click
  `Decompose` → the subtask form is pre-filled for you to confirm. Open a task
  whose title contains *"vague"* and `Decompose` → the agent asks a clarifying
  question instead.
- **Real key (`ANTHROPIC_API_KEY` set, `MOCK_LLM=0`):** in the chat, type
  *"create a task to refactor auth, high priority"* → a high-priority card appears.
  Ask *"what should I start with?"* → the prioritization sub-agent replies with a
  recommendation and reasoning.

### All scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm run db:generate` | Generate a Drizzle migration from the schema. |
| `npm run db:migrate` | Apply migrations to the SQLite database. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm run lint` | Biome lint/format check + TS-directive guard. |
| `npm run format` | Biome auto-format. |
| `npm run test` / `npm run test:watch` | Vitest. |
| `npm run test:e2e` | Playwright e2e. |

---

## Out of scope

Per [`docs/DESIGN.md`](docs/DESIGN.md) §8, intentionally **not** included:
authentication, multi-user, roles/permissions, deployment/hosting, persistent
chat history (it is client-held and lost on reload, by design), real-time
multi-client collaboration, and subtask nesting deeper than one level.
