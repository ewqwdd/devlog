# DevLog — Roadmap

Build order derived from `DESIGN.md`. Each phase ends with a verifiable
checkpoint; a phase is "done" only when its checkpoint passes. AI features
follow the design's dependency order: chat agent + prioritization are the core,
decomposition and the status generator come after.

## Progress

- [x] Phase 0 — Project scaffold
- [x] Phase 1 — Data layer
- [x] Phase 2 — Task CRUD + kanban board
- [x] Phase 3 — Subtasks
- [x] Phase 4 — Chat agent
- [ ] Phase 5 — Prioritization agent
- [ ] Phase 6 — Task decomposition
- [ ] Phase 7 — Status-update generator + Status Log
- [ ] Phase 8 — Polish & handoff

## Phase 0 — Project scaffold

- Next.js (App Router) + TypeScript strict.
- Tailwind v4 + shadcn/ui initialized.
- Biome (lint + format), Vitest, Playwright wired into scripts.
- pino logger setup in `shared/lib/`.
- Folder skeleton per CLAUDE.md: `app/`, `components/`, `services/`,
  `use-cases/`, `shared/{ui,repositories,infra,lib,types}/`.
- `.env.example` with `ANTHROPIC_API_KEY` and `MOCK_LLM`.
- Update CLAUDE.md after this phase: add the new npm commands
  (dev / test / lint / etc.), and in the line
  "- Structured logger (pino), never `console.log`." add a direct link to the
  logger file created in this phase (e.g. `shared/lib/logger.ts`).

**Checkpoint:** `npm install && npm run dev` serves an empty page;
lint/typecheck/test scripts all pass on the empty project.

## Phase 1 — Data layer

- Drizzle schema: `tasks`, `subtasks`, `status_updates` (as in DESIGN.md §4).
- SQLite connection in `shared/infra/`, migrations generated and applied.
- Repositories for all three tables in `shared/repositories/` (CRUD +
  position-aware queries).

**Checkpoint:** Vitest integration tests against a temp SQLite file: create /
read / update / delete rows through repositories; cascade delete of subtasks
and status updates when a task is deleted.

## Phase 2 — Task CRUD + kanban board

- `tasks` service (business logic: position assignment `max+1`, column
  renumbering on reorder, status transitions).
- Server Actions (controller layer, zod-validated) for create / edit / delete /
  move.
- Board page: three columns (`todo`, `in-progress`, `done`), cards ordered by
  `position`.
- Drag-and-drop with dnd-kit: cross-column move (status + position) and
  in-column reorder; optimistic updates via React Query, persistence via
  Server Action.
- Task modal (view/edit), "New task" modal, delete from card/modal.

**Checkpoint:** unit tests for reorder/renumber logic; Playwright e2e: create
task → drag to another column → reload → state persisted.

## Phase 3 — Subtasks

- Subtasks service + Server Actions (one level, no priority).
- Subtask list inside the task modal: add, edit, toggle done, reorder, delete.

**Checkpoint:** e2e: open task modal, add/complete/delete a subtask, reload,
state persisted.

## Phase 4 — Chat agent (feature D, core)

- Vercel AI SDK: `streamText` Route Handler with the multi-step tool loop,
  `@ai-sdk/anthropic` provider.
- Tools as thin zod-typed wrappers over services: `listTasks(filter)`,
  `createTask`, `editTask`, `deleteTask` (+ `runPrioritization` stub for
  Phase 5).
- `MOCK_LLM` toggle: mock model via AI SDK test utilities so dev doesn't burn
  keys.
- Chat panel pinned right of the board (`useChat`, client-held history).
- React Query cache invalidation after any agent mutation — board reflects
  chat-made changes.

**Checkpoint:** with a real key, "create a task to refactor auth, high
priority" creates a card on the board without reload; with `MOCK_LLM=1` the
loop runs offline; tool-wrapper unit tests pass.

## Phase 5 — Prioritization agent (feature A)

- Sub-agent implemented inside the `runPrioritization` tool's `execute`: its
  own `generateText` call with the `listTasks` tool (agent-invoking-agent).
- Behavior per DESIGN.md §6.2: in-progress first; else analyze todo by age,
  priority, content; else "no tasks".
- Prompt written and iterated separately.

**Checkpoint:** "what should I start with?" in chat triggers the sub-agent and
returns a recommendation with reasoning; unit test of the tool with a mock
model covering all three board states (has in-progress / only todo / all done).

## Phase 6 — Task decomposition (feature B)

- "Decompose" button in the task modal.
- Vague-task path: agent asks a clarifying question before generating.
- Clear-task path: `generateObject` (zod schema) → autofills the subtask form →
  user edits/confirms. Auto-fill, never silent creation.

**Checkpoint:** e2e with mock model: vague task → clarifying question; clear
task → prefilled subtask form → confirm → subtasks saved.

## Phase 7 — Status-update generator (feature C) + Status Log

- Backend catches the `status → done` transition (use-case orchestrating tasks
  + status-updates services), passes `taskId` to the agent.
- Agent fetches task + subtasks, writes a Slack-style update, surfaces the next
  highest priority; stored as a `status_updates` row.
- Status Log page listing updates.

**Checkpoint:** drag a card to done → a status update appears on the Status Log
page; moving done → done or done → todo does not generate one.

## Phase 8 — Polish & handoff

- README: setup, `MOCK_LLM` usage, what's out of scope (per DESIGN.md §8).
- Full gate green: typecheck, Biome, Vitest, Playwright.
- Empty-board / error states reviewed (LLM call failure surfaces a readable
  error in chat, not a crash).

**Checkpoint:** fresh clone → `npm install && npm run dev` → all features work
with a provided key; full test suite passes.
