# Phase 3 — Subtasks: Design Spec

> ROADMAP: Phase 3 — Subtasks

Add subtask management to DevLog: a subtask list inside the **Task modal** (the
task view/edit modal delivered by Phase 2 — see "Task modal" below) where the
user can add, rename, toggle completed, reorder (drag-and-drop), and delete
subtasks. One level only, no priority. Positions of a task's subtasks are kept
**dense**: always exactly `0, 1, …, n-1` with step 1. Layers per CLAUDE.md:
Server Actions (controller) → `subtasks` service → existing `subtasksRepository`.

## Decisions made during brainstorming

- **The `completed` field already exists.** The working tree contains
  uncommitted Phase-1 amendments: `subtasks.done` renamed to `completed`,
  `subtasks.description` dropped, migration `0000` regenerated, DESIGN.md /
  ROADMAP.md / repository / tests updated. Phase 3 treats this as its baseline
  and adds **no schema or migration changes**. These amendments must be
  committed (as a Phase-1 amendment commit) before Phase 3 implementation
  starts.
- **Phase 2 is a hard prerequisite.** The Task modal, `@dnd-kit/*`, and
  `@tanstack/react-query` all arrive with Phase 2 (none are in `package.json`
  today). Phase 3 cannot be implemented before Phase 2 lands.
- **Move = splice + full renumber, in one transaction.** Moving a subtask is
  remove-at-old-index, insert-at-new-index, then renumber the whole list
  `0..n-1` via the existing transactional `updatePositions`. This is exactly
  equivalent to the required range shift (moving index 5 to index 0 increments
  former indices 0–4 by one) but simpler and self-healing.
- **No use-case layer.** One service is enough, so Server Actions call the
  subtasks service directly (CLAUDE.md use-case rule). Parent-task existence on
  create is enforced by the FK constraint (`PRAGMA foreign_keys = ON`), not by
  a lookup through the tasks repository — keeps the module boundary clean.
- **Optimistic updates for toggle and reorder only.** A checkbox must flip
  instantly and a dropped card must not snap back. Create / rename / delete
  await the Server Action and then invalidate — simpler, and latency is local.
- **`SubtaskSection` lives in `components/`.** It renders in two places — the
  Task modal and its standalone fallback page (intercepting-route pattern) —
  so per the folder rules it is a project-bound reusable component, not an
  `app/<page>/_components/` one.
- **shadcn first.** `checkbox` and `input` are installed via the shadcn CLI
  into `shared/ui/` (only `button` exists today) before any custom UI is
  written.
- **Test DB helper is shared.** The Phase-1 helper
  `shared/repositories/__tests__/db-test-setup.ts` moves to
  `shared/testing/db-test-setup.ts` so service and action tests can reuse it
  without importing another module's test internals (existing imports
  updated). If Phase 2 has already relocated or replaced it, follow Phase 2's
  lead instead.

## 1. Task modal — the integration point

"**Task modal**" throughout this spec = the task view/edit modal built in
Phase 2: opened by clicking a card on the board, implemented per the CLAUDE.md
modal rule as an intercepting route (parallel `app/@modal` slot + `(.)`
segment) with a standalone full page at the real task route as fallback. At
plan time, locate it among Phase 2's deliverables (search for the `@modal`
slot / the task route segment).

Phase 3's integration is deliberately one line per surface: the Task modal
**and** its fallback page each render
`<SubtaskSection taskId={task.id} initialSubtasks={subtasks} />`, where
`subtasks` is loaded server-side (RSC) via the subtasks service. Everything
else in this phase is self-contained.

## 2. Ordering model

Invariant: **for any task, its subtasks' `position` values are exactly
`0, 1, …, n-1`** (difference between neighbours is always 1). Every operation
preserves it:

- **Create** appends at the end: `position = getMaxPosition(taskId) + 1`
  (`0` for the first subtask).
- **Move** from index `i` to index `j` (splice semantics): the mover takes
  `j`; if `j < i`, former positions `j..i-1` increment by 1; if `j > i`,
  former positions `i+1..j` decrement by 1; everything else is untouched.
  Example (the requirement's own): moving the subtask at position 5 to
  position 0 → former 0–4 become 1–5, the mover becomes 0, 6+ unchanged.
  Implementation: in-memory splice + renumber `0..n-1`, persisted with
  `subtasksRepository.updatePositions` (already a single transaction); only
  rows whose position changed are written. Target index out of range is
  **clamped** to `[0, n-1]`. `i === j` is a no-op (no writes).
- **Delete** at index `i`: delete the row, then decrement positions of all
  subtasks after it (renumber of the remaining list). The delete and the
  renumber are two consecutive synchronous repository calls, not one
  transaction: a crash between them leaves a gap that never affects ordering
  (list is ordered by `position` asc) and is repaired by the next move. Not
  worth pushing business logic into the repository for a local single-user
  app.
- **Rename / toggle completed** never touch `position`. Completed subtasks
  stay in place (no auto-sort to the bottom).

## 3. Repository — no changes

`shared/repositories/subtasks-repository.ts` already provides everything the
service needs: `create`, `findById`, `listByTaskId` (ordered by `position`
asc), `update` (patch: title / completed / position), `delete`,
`getMaxPosition`, `updatePositions` (transactional batch).

## 4. Service — `services/subtasks-service.ts`

Synchronous (better-sqlite3, same rationale as Phase 1), pure orchestration of
the repository plus the ordering rules of §2:

| function | behavior |
|---|---|
| `listSubtasks(taskId: string): Subtask[]` | `listByTaskId`, position asc |
| `createSubtask(input: { taskId: string; title: string }): Subtask` | append at end (§2); unknown `taskId` → FK violation propagates as an error |
| `renameSubtask(id: string, title: string): Subtask` | `update({ title })`; unknown id → throws `SubtaskNotFoundError` |
| `setSubtaskCompleted(id: string, completed: boolean): Subtask` | `update({ completed })`; unknown id → throws `SubtaskNotFoundError` |
| `moveSubtask(id: string, toPosition: number): Subtask[]` | splice + renumber per §2, returns the task's reordered list; unknown id → throws `SubtaskNotFoundError` |
| `deleteSubtask(id: string): void` | delete + tail renumber per §2; unknown id → throws `SubtaskNotFoundError` |

`SubtaskNotFoundError extends Error` is defined next to the service (single
consumer today). If Phase 2 established a shared not-found error convention,
reuse it.

## 5. Controller — Server Actions

One file of zod-v4-validated Server Actions in `app/` (co-located with
Phase 2's task actions if a location convention exists by then; otherwise
`app/actions/subtasks.ts`). No business logic — validate, call service, map
errors. All actions return the same discriminated result shape as Phase 2's
actions (align at plan time); on a caught known error (`SubtaskNotFoundError`,
FK violation, zod failure) they return the error variant, never throw to the
client.

| action | input schema (zod v4) |
|---|---|
| `createSubtaskAction` | `{ taskId: string min 1, title: string trim min 1 max 200 }` |
| `renameSubtaskAction` | `{ id: string min 1, title: string trim min 1 max 200 }` |
| `toggleSubtaskAction` | `{ id: string min 1, completed: boolean }` |
| `moveSubtaskAction` | `{ id: string min 1, toPosition: int ≥ 0 }` (clamped in service) |
| `deleteSubtaskAction` | `{ id: string min 1 }` |

No `revalidatePath`: subtask data on the client is owned by React Query
(initial data comes from the RSC render; afterwards the query cache is
authoritative; reload re-fetches via RSC). This also keeps the actions plain
async functions that Vitest can call directly.

## 6. UI — `components/subtasks/`

Three pieces, client components, Tailwind only, shadcn from `shared/ui/`:

- **`SubtaskSection`** — owns the data: `useQuery({ queryKey: ['subtasks',
  taskId], initialData })` and the five mutations wrapping the Server
  Actions. Toggle and reorder mutations are optimistic (`onMutate` snapshot →
  rollback `onError` → invalidate `onSettled`); create / rename / delete
  invalidate on success. Renders the add-subtask input (placeholder + Enter or
  button submits, clears on success, disabled while pending) and the list.
- **`SubtaskList`** — dnd-kit vertical sortable (`DndContext` +
  `SortableContext` + `verticalListSortingStrategy`); on drag end computes the
  target index and fires the move mutation with `{ id, toPosition }`.
- **`SubtaskItem`** — one row: drag handle, shadcn `Checkbox` bound to
  `completed`, title with inline edit (click title → input; Enter/blur saves
  via rename mutation, Esc cancels; empty title cancels instead of saving),
  delete button. Completed titles get muted/line-through styling. Rows carry
  `data-testid` hooks for e2e (`subtask-item`, `subtask-drag-handle`, etc.).

Errors from any mutation surface as an inline error message in the section
(and the optimistic ones roll back); no toast library is introduced.

## 7. Testing & Verification

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes (Biome + directive guard)
- `npm run build` — builds successfully

### Unit/integration tests (Vitest) — `npm run test`

- `services/__tests__/subtasks-service.test.ts` (temp SQLite via the shared
  db-test-setup helper, real migrations)
  - create appends densely: three creates → positions `0, 1, 2`
  - create for unknown taskId → throws (FK enforced)
  - rename updates title and nothing else; unknown id → `SubtaskNotFoundError`
  - setSubtaskCompleted flips the flag both ways; unknown id → `SubtaskNotFoundError`
  - move backward (the requirement's example): positions `0..5`, move the
    subtask at 5 to 0 → it gets 0, former 0–4 become 1–5
  - move forward: move 0 → 2 with four rows → order and dense invariant hold
  - move with `toPosition` past the end (e.g. 99) → clamped to last index
  - move to own index → no-op, positions unchanged
  - delete middle row → remaining positions are `0..n-2` (tail decremented)
  - per-task scoping: two tasks with subtasks — operations on one never
    change the other's positions
- `app/actions/__tests__/subtasks-actions.test.ts` (same temp-DB helper;
  actions called directly as functions)
  - `createSubtaskAction` happy path → success variant with the created row
  - empty / whitespace title → error variant (zod), nothing inserted
  - `moveSubtaskAction` with unknown id → error variant, no throw
- Existing Phase-1 repository tests still pass after the db-test-setup helper
  moves to `shared/testing/`.

### E2E tests (Playwright) — `npm run test:e2e`

- `e2e/subtasks.spec.ts` (each scenario: create a task via the Phase-2 UI,
  open its Task modal)
  - add: type a title in the add input, press Enter → subtask appears in the
    list; reload → still there (roadmap checkpoint)
  - complete: click a subtask's checkbox → it renders checked/struck-through;
    reload → still completed (roadmap checkpoint)
  - rename: click the title, edit, press Enter → new title shown; reload →
    persisted
  - reorder: with three subtasks A, B, C, mouse-drag A's handle below B →
    order B, A, C; reload → order persisted
  - delete: click a subtask's delete button → row disappears; reload → still
    gone (roadmap checkpoint)

### Viewport screenshots

- Command: `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs <board url> <task page url>`
  (dev server running; a task with several subtasks, some completed, prepared
  first; the task page URL is the Phase-2 fallback route for the Task modal,
  e.g. `http://localhost:3000/tasks/<id>` — confirm the segment at plan time)
- Check: Read each PNG — subtask list intact at 375×812 and 1440×900, no
  overflow/overlap, checkbox / handle / delete reachable, add input visible.

### Skipped categories

- API smoke (curl): skipped — Server Actions are not plain HTTP endpoints;
  controller behavior is covered by the action-level Vitest cases and e2e.
- DB checks: skipped — no schema change in this phase; position/state
  persistence is asserted by the service integration tests and the e2e
  reload steps.

### Requirement coverage

- Subtask belongs to one task → schema FK (Phase 1) + per-task scoping test
- List visible inside the Task modal → every e2e scenario opens the modal
- Toggle completed → service toggle test + e2e "complete" + screenshots
  (completed styling)
- Drag-and-drop reorder → e2e "reorder" + service move tests
- Position diff always 1 (dense invariant, incl. the move-5-to-0 example) →
  service tests: dense create, move backward/forward, clamp, no-op
- Decrement after delete → service "delete middle row" test
- Create / delete / rename inside the modal → e2e add / delete / rename +
  action tests
- Validation at the boundary → empty-title action test
- Roadmap checkpoint (add/complete/delete + reload persists) → the three
  marked e2e scenarios

## Out of scope (later phases)

AI decomposition autofill (Phase 6) — but it will reuse this phase's service
and form. Status-update generation on completion (Phase 7). Subtask priority,
description, nesting, due dates — excluded by DESIGN.md. Task-level progress
indicator (e.g. "2/5") — not requested.
