# Phase 2 — Task CRUD + Kanban Board: Design Spec

> ROADMAP: Phase 2 — Task CRUD + kanban board

Build the visible tracker on top of the Phase 1 data layer: a `tasks` service
owning all ordering rules (dense positions, renumbering), zod-validated Server
Actions, a three-column board (`todo`, `in-progress`, `done`) with dnd-kit
drag-and-drop (cross-column move + in-column reorder), a routed "New task"
modal, and a routed full-screen task modal with per-field autosave editing.
Board state lives entirely on the client in React Query; persistence goes
through Server Actions.

## Decisions made during brainstorming

- **Server computes renumbering from intent.** The client sends
  `{taskId, toStatus, toIndex}`; the service derives the dense renumbering and
  writes it in one transaction. The optimistic update applies the same
  permutation locally (plain `arrayMove` + reindex), but the service is the
  single owner of the ordering invariants. (Rejected: client sends final
  positions — puts a business rule in the UI layer and the server must
  re-validate density anyway. Rejected: fractional ranking — contradicts the
  "difference between neighbors is always 1" requirement and DESIGN.md §7.)
- **Board data is client-only.** `app/page.tsx` does no data fetching; the
  board loads via React Query (`getBoardAction`). No RSC `initialData`, no
  `revalidatePath` for the board.
- **Per-field autosave** in the task modal (Linear/Notion style): blur/Enter
  saves text fields, select-change saves status/priority. No Save button.
- **Delete needs confirmation** (shadcn `AlertDialog`), available both on the
  card (hover button) and inside the task modal.
- **Create form has all 4 fields**: title (required), description, status
  (default `todo`), priority (default `medium`). The new task appends to the
  bottom of the chosen column (`max(position) + 1`).
- **Cross-column drop lands at the precise drop index** (Trello-style); both
  columns are renumbered in one transaction. Changing status from the modal
  appends to the end of the new column.
- **Modals are intercepting routes** (CLAUDE.md rule): parallel slot
  `app/@modal` + `(.)` intercepts, with standalone fallback pages at the real
  routes.

## 1. Layers & files

```
services/tasks-service.ts                business logic (ordering rules)
services/compute-move.ts                 pure renumbering function
services/__tests__/tasks-service.test.ts
services/__tests__/compute-move.test.ts
app/actions/tasks.ts                     Server Actions (controller layer)
app/actions/__tests__/tasks.test.ts
app/page.tsx                             thin server page → renders <Board>
app/@modal/default.tsx                   empty slot (returns null)
app/@modal/(.)tasks/new/page.tsx         intercepted create modal
app/@modal/(.)tasks/[id]/page.tsx        intercepted task modal
app/tasks/new/page.tsx                   standalone create page (fallback)
app/tasks/[id]/page.tsx                  standalone task page (fallback)
app/_components/                         board, board-column, task-form,
                                         task-modal-content, providers wiring
components/providers.tsx                 QueryClientProvider (client)
components/task-card.tsx                 pure display card (reusable)
shared/ui/                               shadcn: dialog, alert-dialog, select,
                                         input, textarea, sonner, ...
```

No use-case layer: every flow is served by the single `tasksService`
(CLAUDE.md use-case rule). New dependencies, all from the fixed stack:
`@tanstack/react-query`, `@dnd-kit/core`, `@dnd-kit/sortable`, `zod`.

## 2. Tasks service — ordering semantics

`tasksService` is the only owner of ordering rules. Invariants after every
operation, per column:

1. Positions are a dense sequence `0..n-1` — no gaps, no duplicates.
2. The difference between neighbors is always 1.

### API

| method | behavior |
|---|---|
| `createTask(input)` | `position = (getMaxPosition(status) ?? -1) + 1` — appends to the bottom of its column |
| `updateTask(id, patch)` | title / description / priority only. A `status` change is NOT a plain update — callers use `moveTask` |
| `moveTask(id, toStatus, toIndex)` | single operation for dnd drops and modal status changes; computes the dense renumbering and persists via `tasksRepository.updatePositions` (one transaction) |
| `deleteTask(id)` | deletes the row (Phase 1 cascade) and closes the gap: every task in the column with a higher `position` gets `-1` |
| `listBoard()` | all tasks grouped by status, each group ordered by `position` asc |

### `computeMove` (pure function, `services/compute-move.ts`)

`computeMove(columns, taskId, toStatus, toIndex) → TaskPositionUpdate[]`

- **In-column move up** (e.g. position 5 → 0): tasks at positions 0–4 get
  `+1`, the moved task gets 0.
- **In-column move down** (e.g. 0 → 5): tasks at 1–5 get `-1`, the moved task
  gets 5.
- **Cross-column**: source column — every task after the removed one gets
  `-1`; target column — every task with `position >= toIndex` gets `+1`; the
  moved task gets `toIndex` and the new `status`.
- Returns **only rows whose position or status actually changed** (minimal
  transaction).
- Edge cases: `toIndex` clamped to `0..targetLength`; move to the same spot →
  empty array (no write); unknown `taskId` → `TaskNotFoundError`.

`TaskNotFoundError extends Error` lives with the service and is thrown by
`moveTask` / `updateTask` / `deleteTask` for unknown ids.

## 3. Server Actions (controller) — `app/actions/tasks.ts`

`createTaskAction`, `updateTaskAction`, `moveTaskAction`, `deleteTaskAction`,
`getBoardAction`. Each mutation action: parse input with its zod schema → call
the service → return a discriminated union
`{ ok: true; data } | { ok: false; error: string }`. Actions never throw to
the client.

zod schemas (in the same file; they validate the transport boundary):

- `createTaskSchema` — `title: string().trim().min(1).max(200)`,
  `description: string().max(2000).default('')`, `status`/`priority` enums
  matching the schema.
- `updateTaskSchema` — `id: uuid`, partial `{title, description, priority}`
  with the same constraints (no `status` — that's `moveTaskAction`).
- `moveTaskSchema` — `id: uuid`, `toStatus` enum,
  `toIndex: number().int().min(0)`.
- `deleteTaskSchema` — `id: uuid`.

Error mapping: zod failure → `{ok: false, error: <first issue message>}`;
`TaskNotFoundError` → its message; unknown errors → logged via pino
(`shared/lib/logger.ts`) and returned as `{ok: false, error: "Something went
wrong"}`.

## 4. Board UI — React Query + dnd-kit

### Data flow

- `components/providers.tsx` (client) wraps the app in `QueryClientProvider`;
  mounted in `app/layout.tsx`.
- `<Board>` (client, `app/_components/`) loads data with
  `useQuery({ queryKey: ['board'], queryFn: getBoardAction })`. Column
  skeletons while loading.
- Every mutation is a `useMutation` over a Server Action:
  - `onMutate` — cancel in-flight board queries, snapshot the cache, apply the
    optimistic change (for moves: the same permutation the server computes —
    `arrayMove` + reindex `map((t, i) => ({...t, position: i}))`).
  - `onError` — restore the snapshot, show an error toast (shadcn `sonner`).
  - `onSettled` — `invalidateQueries({ queryKey: ['board'] })`; the server
    state always wins.

### dnd-kit

- One `DndContext` per board; each column is a `SortableContext`
  (`verticalListSortingStrategy`) over its card ids; an empty column exposes a
  droppable zone so cards can be dropped into it.
- `PointerSensor` with `activationConstraint: { distance: 8 }` — a plain click
  opens the task modal instead of starting a drag.
- `DragOverlay` renders the flying card copy.
- `onDragOver` moves the card across columns in local state (live preview);
  `onDragEnd` finalizes: derive `{taskId, toStatus, toIndex}` and fire the
  move mutation. No DB writes before drop.

### Card — `components/task-card.tsx`

Pure display: title, priority badge (color per level), hover delete button
(opens the confirm dialog). Click → `router.push('/tasks/<id>')`.

## 5. Modals & routing

- `app/@modal` parallel slot rendered in the root `layout.tsx` next to
  `children`; `default.tsx` returns `null`.
- **Create**: "New task" button (top-right of the board) →
  `router.push('/tasks/new')` → intercepted route opens a shadcn `Dialog` with
  the form (title required — validated client-side with the same zod schema
  and again in the action). Submit → `createTaskAction` → optimistic append to
  the chosen column → `router.back()`.
- **View/edit**: card click → `/tasks/<id>` → full-screen `Dialog`
  (viewport-sized). Per-field autosave: title (input, save on blur/Enter),
  description (textarea, save on blur), status and priority (`Select`, save on
  change; status change calls `moveTaskAction` with
  `toIndex = target column length`). Delete button with `AlertDialog`
  confirmation → on confirm, optimistic removal + `router.back()`.
- Closing (X / Esc / overlay click) → `router.back()`.
- **Standalone fallbacks** (`app/tasks/new`, `app/tasks/[id]`): same form /
  task content rendered as a normal page — direct links and refresh work. The
  task page reads from the same `['board']` query (client component); unknown
  id → `notFound()`.
- The task modal reads its task from the `['board']` cache — no per-task query
  key; autosave mutations patch the single board cache. On a direct visit the
  query simply fetches first.

## 6. Errors & edge cases

- All external input validated at the Server Action boundary (zod) before any
  business logic.
- Only `Error` subclasses thrown inside the server; one response shape
  (`{ok, data|error}`) across all actions.
- Client: failed mutation → snapshot rollback + toast; a failed move visually
  returns the card to its origin.
- Concurrency is out of scope (single local user); the `updatePositions`
  transaction already keeps a single operation atomic.

## Testing & Verification

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes
- `npm run build` — builds successfully

### Unit/integration tests (Vitest) — `npm run test`

- `services/__tests__/compute-move.test.ts` (pure, no DB)
  - in-column up: column of 6, move position 5 → 0 ⇒ tasks at 0–4 each `+1`,
    moved task gets 0; result stays dense `0..5`
  - in-column down: move 0 → 5 ⇒ tasks at 1–5 each `-1`, moved task gets 5
  - cross-column: source closes the gap (`-1` after the removed index), target
    shifts `+1` at `>= toIndex`, moved row gets `toIndex` + new status; both
    columns dense afterwards
  - cross-column into empty column ⇒ moved row gets position 0, source closes
    the gap
  - minimal diff: returned array contains only rows whose position/status
    changed
  - no-op: same column, same index ⇒ empty array
  - clamp: `toIndex` beyond target length ⇒ treated as append (end of column)
  - unknown taskId ⇒ throws `TaskNotFoundError`
- `services/__tests__/tasks-service.test.ts` (temp SQLite via Phase 1 test
  setup helper)
  - createTask appends: empty column ⇒ position 0; column with 0..2 ⇒ 3
  - moveTask persists atomically: cross-column move ⇒ both columns re-read
    dense and correctly ordered
  - moveTask from modal-style call (`toIndex = target length`) ⇒ lands last
  - deleteTask closes the gap: delete middle card ⇒ followers shifted `-1`,
    column dense
  - updateTask patches title/description/priority and bumps `updatedAt`
  - moveTask/updateTask/deleteTask with unknown id ⇒ `TaskNotFoundError`
  - listBoard groups by status, each group ordered by position asc
- `app/actions/__tests__/tasks.test.ts` (actions called as plain functions,
  temp SQLite)
  - createTaskAction happy path ⇒ `{ok: true}`, row exists with defaults
  - createTaskAction empty/whitespace title ⇒ `{ok: false, error}` — no row
    created
  - moveTaskAction invalid input (negative `toIndex`, bad status enum, non-uuid
    id) ⇒ `{ok: false, error}`
  - moveTaskAction unknown id ⇒ `{ok: false, error}` (mapped
    `TaskNotFoundError`, not a throw)
  - deleteTaskAction ⇒ `{ok: true}`, row gone

### E2E tests (Playwright) — `npm run test:e2e`

E2E setup (part of this phase): `playwright.config.ts` gains
`webServer.env = { DB_FILE_NAME: '.e2e/devlog-e2e.db' }` and a `globalSetup`
that removes the old e2e DB file and applies the real migrations
programmatically (same migrator as the Vitest helper) — e2e never touches the
dev database and starts deterministic. `.e2e/` goes to `.gitignore`. dnd is
driven by a `dragCard(page, cardTitle, target)` helper using
`mouse.down/move/up` (dnd-kit's PointerSensor needs real pointer steps, not
`dragTo`).

- `e2e/board.spec.ts`
  - create: open "New task" → fill title/description, pick status
    `in-progress`, priority `high` → submit ⇒ modal closes, card visible at
    the bottom of In Progress; **reload ⇒ card still there** (checkpoint)
  - create validation: submit with empty title ⇒ error shown, no card appears
  - drag cross-column: drag a Todo card into In Progress between two existing
    cards ⇒ card lands at that exact index; **reload ⇒ status and order
    persisted** (checkpoint)
  - drag in-column: move the bottom card of Todo to the top ⇒ order changes;
    reload ⇒ order persisted
  - drag into empty column ⇒ card lands there; reload ⇒ persisted
- `e2e/task-modal.spec.ts`
  - open: click a card ⇒ full-screen modal at `/tasks/<id>`; Esc ⇒ back on the
    board
  - autosave: edit title (blur), description (blur), priority (select) ⇒
    reload board ⇒ changes persisted
  - status via modal: change status select ⇒ card appears at the end of the
    new column on the board
  - delete from modal: Delete → confirm ⇒ modal closes, card gone; reload ⇒
    still gone
  - delete from card: hover delete → confirm ⇒ card gone
  - direct link: `page.goto('/tasks/<id>')` ⇒ standalone page renders the
    task; unknown id ⇒ 404

### Viewport screenshots

- Command (dev server running):
  `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000 http://localhost:3000/tasks/new http://localhost:3000/tasks/<seeded-id>`
- Pages: board with cards in all three columns, create form, task page.
- Check: Read each PNG — three columns laid out, cards not overflowing,
  modals/forms intact at 375×812 and 1440×900.

### API smoke (curl)

- Skipped — Server Actions are not curl-addressable endpoints (Next encodes
  action ids); boundary validation is covered by the action-level Vitest cases
  and the e2e flows above.

### DB checks

- Skipped as a separate category — persistence is asserted through reload
  steps in every e2e scenario, and service/action tests assert row state
  directly against the temp SQLite DB. No schema changes in this phase.

### Requirement coverage

- Dense order, neighbor diff always 1, shift on move (the position-5 → 0
  example) → `compute-move.test.ts` in-column/cross-column/density cases
- Delete closes the gap (`-1` for followers) → service deleteTask case; e2e
  delete + reload
- Create appends `max+1` to the chosen column → service createTask cases; e2e
  create scenario
- Cross-column drag to a precise index + in-column reorder via dnd →
  `board.spec.ts` drag scenarios (incl. empty column)
- Create modal with all fields → e2e create scenario; create validation case
- Full-screen task modal, per-field autosave of name/description/status/
  priority → `task-modal.spec.ts` autosave + status cases
- Modal = intercepting route with working direct link/refresh → direct-link
  case; open/Esc case
- Delete with confirmation from card and modal → both delete e2e cases
- zod validation at the boundary, `{ok, error}` shape, no throws to client →
  action-level Vitest cases
- ROADMAP checkpoint (reorder/renumber unit tests; create → drag → reload
  persisted) → `compute-move.test.ts` + the two checkpoint-marked e2e steps

## Out of scope (later phases)

Subtasks UI (Phase 3 — the modal gains the subtask list then). Chat panel and
agent tools (Phase 4). Status-update generation on `done` (Phase 7). Seed
data. Concurrency/multi-user.
