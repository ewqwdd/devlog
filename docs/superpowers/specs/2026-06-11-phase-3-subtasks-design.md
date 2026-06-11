# Phase 3 — Subtasks: Design Spec

> ROADMAP: Phase 3 — Subtasks

Add subtask management to DevLog: a subtask list inside the **Task modal** (the
task view/edit modal delivered by Phase 2 — see §1) where the user can add,
rename, toggle done, reorder (drag-and-drop), and delete subtasks. One level
only, no priority. Positions of a task's subtasks are kept **dense**: always
exactly `0, 1, …, n-1` with step 1. Layers per CLAUDE.md: Server Actions
(controller) → `subtasksService` → existing `subtasksRepository`. The design
deliberately mirrors Phase 2's conventions (spec
`2026-06-11-phase-2-task-crud-kanban-design.md`) one-to-one: same action result
shape, same mutation recipe, same pure-compute + service split, same e2e infra.

## Decisions made during brainstorming

- **No schema changes.** The `subtasks` table already has everything Phase 3
  needs — `id`, `taskId` (FK, cascade), `title`, `position`, `done` — since
  Phase 1; commit `384c859` dropped the unused `description` column and fixed
  the field set as `id, taskId, title, position, done`. The "field to mark a
  subtask done" requirement is satisfied by the existing `done` column.
- **Phase 2 is a hard prerequisite.** The Task modal, `@dnd-kit/*`,
  `@tanstack/react-query`, `zod`, shadcn `sonner`/`input`, and the e2e
  infrastructure (isolated `.e2e` DB, drag helper) all arrive with Phase 2
  (none are in `package.json` today; Phase 2 is in development in parallel).
  Phase 3 implementation cannot start before Phase 2 lands.
- **Move = splice + renumber via a pure function, one transaction.** Same
  pattern as Phase 2's `computeMove`: a pure `computeSubtaskMove` derives the
  minimal set of position updates (exactly the required range shift: moving
  index 5 to index 0 increments former 0–4 by one), the service persists it
  with the existing transactional `updatePositions`.
- **No use-case layer.** One service is enough, so Server Actions call
  `subtasksService` directly (CLAUDE.md use-case rule). Parent-task existence
  on create is enforced by the FK constraint (`PRAGMA foreign_keys = ON`), not
  by a lookup through the tasks repository — keeps the module boundary clean.
- **One `updateSubtask` for title and done** (mirrors Phase 2's
  `updateTask` partial-patch shape) instead of separate rename/toggle
  endpoints. Position is never patched directly — that's `moveSubtask`.
- **All mutations optimistic except create.** Toggle / rename / move / delete
  follow Phase 2's mutation recipe (snapshot → optimistic apply → rollback +
  sonner toast on error → invalidate on settle). Create awaits the action and
  then invalidates: an optimistic insert would need a temporary id inside a
  `SortableContext`, and that churn isn't worth it for a local write.
- **Subtask data is client-only, own query key.** Phase 2 made board data
  client-only (`['board']`, no RSC fetching); subtasks follow:
  `['subtasks', taskId]` fed by a `getSubtasksAction`. No RSC `initialData`,
  no `revalidatePath`.
- **Component placement follows Phase 2's precedent.** Subtask UI lives in
  `app/_components/` next to `task-modal-content` (which already serves both
  the intercepted modal and the `/tasks/[id]` fallback page). Nothing outside
  the task modal consumes subtasks today; promotion to `components/` waits for
  a second consumer (YAGNI).

## 1. Task modal — the integration point

"**Task modal**" throughout this spec = the task view/edit modal from Phase 2:
opened by clicking a card on the board, full-screen shadcn `Dialog`,
implemented as an intercepting route — `app/@modal/(.)tasks/[id]/page.tsx`
with the standalone fallback page `app/tasks/[id]/page.tsx`, both rendering
the shared `app/_components/task-modal-content` component (file names per the
Phase 2 spec §1/§5; confirm exact names against the merged Phase 2 code at
plan time).

Phase 3's integration is **one line**: `task-modal-content` renders
`<SubtaskSection taskId={task.id} />` below the task fields. Because both the
intercepted modal and the fallback page render `task-modal-content`, subtasks
appear on both surfaces automatically. Everything else in this phase is
self-contained new code.

## 2. Ordering model

Invariant: **for any task, its subtasks' `position` values are exactly
`0, 1, …, n-1`** (difference between neighbours is always 1). Every operation
preserves it:

- **Create** appends at the end:
  `position = (getMaxPosition(taskId) ?? -1) + 1`.
- **Move** from index `i` to index `j` (splice semantics): the mover takes
  `j`; if `j < i`, former positions `j..i-1` increment by 1; if `j > i`,
  former positions `i+1..j` decrement by 1; everything else is untouched.
  Example (the requirement's own): moving the subtask at position 5 to
  position 0 → former 0–4 become 1–5, the mover becomes 0, 6+ unchanged.
  `toPosition` out of range is **clamped** to `[0, n-1]`; `i === j` → no
  writes.
- **Delete** at index `i`: delete the row, then decrement positions of every
  subtask after it. The delete and the renumber are two consecutive
  synchronous repository calls, not one transaction: a crash between them
  leaves a gap that never affects ordering (list is ordered by `position`
  asc) and is repaired by the next move. Not worth pushing business logic
  into the repository for a local single-user app.
- **Title / done updates** never touch `position`. Done subtasks stay in
  place (no auto-sort to the bottom).

## 3. Repository — no changes

`shared/repositories/subtasks-repository.ts` already provides everything the
service needs: `create`, `findById`, `listByTaskId` (ordered by `position`
asc), `update` (patch: title / done / position), `delete`, `getMaxPosition`,
`updatePositions` (transactional batch).

## 4. Service — `services/subtasks-service.ts`

Synchronous (better-sqlite3, same rationale as Phases 1–2). `subtasksService`
owns the ordering rules of §2:

| method | behavior |
|---|---|
| `listSubtasks(taskId: string): Subtask[]` | `listByTaskId`, position asc |
| `createSubtask(input: { taskId: string; title: string }): Subtask` | append at end (§2); unknown `taskId` → FK violation propagates as an error |
| `updateSubtask(id: string, patch: { title?: string; done?: boolean }): Subtask` | patches title/done only; unknown id → throws `SubtaskNotFoundError` |
| `moveSubtask(id: string, toPosition: number): void` | loads the task's list, applies `computeSubtaskMove`, persists via `updatePositions` (one transaction); unknown id → throws `SubtaskNotFoundError` |
| `deleteSubtask(id: string): void` | delete + tail renumber per §2; unknown id → throws `SubtaskNotFoundError` |

### `computeSubtaskMove` (pure function, `services/compute-subtask-move.ts`)

`computeSubtaskMove(subtasks, id, toPosition) → SubtaskPositionUpdate[]`
— the single-list analogue of Phase 2's `computeMove`: splice + renumber,
returns **only rows whose position changed** (minimal transaction), clamps
`toPosition`, returns `[]` for a same-spot move, throws
`SubtaskNotFoundError` for an unknown id.

`SubtaskNotFoundError extends Error` lives with the service (same convention
as Phase 2's `TaskNotFoundError`).

## 5. Controller — Server Actions — `app/actions/subtasks.ts`

Same controller pattern as Phase 2's `app/actions/tasks.ts`: parse with zod
v4 → call the service → return
`{ ok: true; data } | { ok: false; error: string }`; actions never throw to
the client. Error mapping identical to Phase 2: zod failure → first issue
message; `SubtaskNotFoundError` → its message; FK violation on create →
readable "task not found" error; unknown errors → logged via pino and
returned as a generic message.

| action | input schema (zod v4) |
|---|---|
| `getSubtasksAction` | `{ taskId: uuid }` → ok-variant data: `Subtask[]` |
| `createSubtaskAction` | `{ taskId: uuid, title: string().trim().min(1).max(200) }` |
| `updateSubtaskAction` | `{ id: uuid }` + partial `{ title (same constraints), done: boolean }`, at least one field present |
| `moveSubtaskAction` | `{ id: uuid, toPosition: number().int().min(0) }` (clamped in service) |
| `deleteSubtaskAction` | `{ id: uuid }` |

No `revalidatePath` (client-only data, §"Decisions"), which also keeps the
actions plain async functions that Vitest calls directly.

## 6. UI — `app/_components/`

Three client components, Tailwind only, shadcn from `shared/ui/` (Phase 2
installs `input` and `sonner`; Phase 3 installs `checkbox` via the shadcn CLI
— per CLAUDE.md, check shadcn before writing any custom control):

- **`subtask-section.tsx`** — owns the data:
  `useQuery({ queryKey: ['subtasks', taskId], queryFn: getSubtasksAction })`
  plus the four mutations. Update / move / delete are optimistic per Phase 2's
  recipe (`onMutate` cancel + snapshot + apply, `onError` rollback + sonner
  toast, `onSettled` invalidate `['subtasks', taskId]`); create awaits the
  action, then invalidates (toast on error). Renders the list and the
  add-subtask input (placeholder + Enter or button submits, clears on
  success, disabled while pending). Loading state: skeleton rows.
- **`subtask-list.tsx`** — dnd-kit vertical sortable: own `DndContext` +
  `SortableContext` (`verticalListSortingStrategy`) over subtask ids,
  `PointerSensor` with `activationConstraint: { distance: 8 }` so clicks
  still hit the checkbox/title (Phase 2 convention). The nested `DndContext`
  also keeps subtask drags from ever reaching the board's context. On drag
  end: derive the target index, fire the move mutation
  `{ id, toPosition }`.
- **`subtask-item.tsx`** — one row: drag handle, shadcn `Checkbox` bound to
  `done`, title with inline edit (click title → input; Enter/blur saves via
  the update mutation, Esc cancels; empty title cancels instead of saving),
  delete button (no confirmation dialog — a subtask is one short line, unlike
  task delete which cascades). Done titles get muted + line-through styling.
  Rows carry `data-testid` hooks for e2e (`subtask-item`,
  `subtask-drag-handle`, `subtask-checkbox`, `subtask-delete`).

## 7. Testing & Verification

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes (Biome + directive guard)
- `npm run build` — builds successfully

### Unit/integration tests (Vitest) — `npm run test`

- `services/__tests__/compute-subtask-move.test.ts` (pure, no DB)
  - move backward (the requirement's example): positions `0..5`, move the
    subtask at 5 to 0 → it gets 0, former 0–4 each `+1`; result dense `0..5`
  - move forward: 0 → 2 with four rows → rows 1–2 each `-1`, mover gets 2;
    dense afterwards
  - minimal diff: returned array contains only rows whose position changed
  - clamp: `toPosition` 99 in a 3-row list → treated as last index
  - no-op: move to own index → empty array
  - unknown id → throws `SubtaskNotFoundError`
- `services/__tests__/subtasks-service.test.ts` (temp SQLite, same test-DB
  setup as Phase 2's service tests)
  - createSubtask appends densely: three creates → positions `0, 1, 2`;
    first subtask of a task → 0
  - createSubtask for unknown taskId → throws (FK enforced)
  - updateSubtask patches title only / done only / both; position untouched
  - updateSubtask / moveSubtask / deleteSubtask with unknown id →
    `SubtaskNotFoundError`
  - moveSubtask persists: list re-read in new order, dense `0..n-1`
  - deleteSubtask middle row → remaining positions `0..n-2` (tail
    decremented)
  - per-task scoping: two tasks with subtasks — operations on one never
    change the other's positions
- `app/actions/__tests__/subtasks.test.ts` (actions called as plain
  functions, temp SQLite)
  - createSubtaskAction happy path → `{ok: true}`, row exists at the end
  - createSubtaskAction empty/whitespace title → `{ok: false, error}`, no
    row inserted
  - createSubtaskAction unknown taskId → `{ok: false, error}` (mapped FK
    violation, not a throw)
  - updateSubtaskAction with neither title nor done → `{ok: false, error}`
  - moveSubtaskAction unknown id / negative toPosition → `{ok: false,
    error}`
  - getSubtasksAction returns the list ordered by position

### E2E tests (Playwright) — `npm run test:e2e`

Reuses Phase 2's e2e infrastructure (isolated `.e2e` DB with migrations in
`globalSetup`; mouse-step drag helper — dnd-kit needs real pointer events).

- `e2e/subtasks.spec.ts` (each scenario: create a task via the UI, open its
  Task modal)
  - add: type a title in the add input, press Enter → subtask appears at the
    bottom of the list; **reload → still there** (roadmap checkpoint)
  - complete: click a subtask's checkbox → checked + struck-through;
    **reload → still done** (roadmap checkpoint)
  - rename: click the title, edit, press Enter → new title shown; reload →
    persisted
  - reorder: with three subtasks A, B, C, drag A's handle below B → order
    B, A, C; reload → order persisted
  - delete: click a subtask's delete button → row disappears; **reload →
    still gone** (roadmap checkpoint)
  - subtasks also render on the standalone page: `page.goto('/tasks/<id>')`
    → the list is visible there

### Viewport screenshots

- Command (dev server running; first prepare a task with several subtasks,
  some done):
  `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000/tasks/<id>`
- Check: Read each PNG — subtask list intact at 375×812 and 1440×900, no
  overflow/overlap, checkbox / drag handle / delete button reachable, add
  input visible, done styling rendered.

### Skipped categories

- API smoke (curl): skipped — Server Actions are not curl-addressable
  endpoints (Phase 2 precedent); boundary validation is covered by the
  action-level Vitest cases and e2e.
- DB checks: skipped — no schema change in this phase; position/state
  persistence is asserted by the service integration tests and the e2e
  reload steps.

### Requirement coverage

- Subtask belongs to one task → schema FK (Phase 1) + per-task scoping test
- List visible inside the Task modal → every e2e scenario opens the modal;
  standalone-page e2e case covers the fallback surface
- Mark done immediately (existing `done` field) → service update tests + e2e
  "complete" + done styling in screenshots
- Drag-and-drop reorder → e2e "reorder" + compute/service move tests
- Position diff always 1 (dense invariant, incl. the move-5-to-0 example) →
  compute tests (backward/forward/clamp/no-op/minimal diff) + service move
  persistence test
- Decrement after delete → service "delete middle row" test
- Create / delete / rename inside the modal → e2e add / delete / rename +
  action tests
- Validation at the boundary, `{ok, error}` shape, no throws to client →
  action-level Vitest cases
- Roadmap checkpoint (add/complete/delete + reload persists) → the three
  checkpoint-marked e2e steps

## Out of scope (later phases)

AI decomposition autofill (Phase 6) — it will reuse this phase's service and
add-subtask form. Status-update generation referencing subtasks (Phase 7).
Subtask priority, description, nesting, due dates — excluded by DESIGN.md.
Task-level progress indicator (e.g. "2/5") — not requested.
