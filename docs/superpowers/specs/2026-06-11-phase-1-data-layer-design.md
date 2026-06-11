# Phase 1 — Data Layer: Design Spec

> ROADMAP: Phase 1 — Data layer

Add the persistence layer to DevLog: the Drizzle schema for `tasks`, `subtasks`,
and `status_updates` (exactly as in DESIGN.md §4), a better-sqlite3 connection
singleton in `shared/infra/db/`, generated SQL migrations applied via a manual
`npm run db:migrate` step, and repositories for all three tables in
`shared/repositories/` (CRUD + position-aware queries). No UI, no services, no
Server Actions in this phase — the deliverable is a tested data layer that
Phase 2 builds on.

## Decisions made during brainstorming

- **Migrations are applied manually** via `npm run db:migrate` (drizzle-kit),
  not auto-applied on app start. Setup order becomes
  `npm install && npm run db:migrate && npm run dev` and is documented in
  CLAUDE.md (and later the README in Phase 8).
- **Driver: better-sqlite3** — the standard Drizzle/SQLite pairing, synchronous,
  prebuilt Windows binaries, works cleanly with temp files in tests.
- **Repositories import the `db` singleton directly** (no DI). Tests rely on
  `DB_FILE_NAME` being set to a temp path *before* the infra module is imported;
  the test design below exists specifically to make that reliable.
- **Repository methods are synchronous.** better-sqlite3 is synchronous;
  wrapping in `async` would be ceremony with no benefit. (CLAUDE.md's
  "async/await only" governs genuinely asynchronous code, not a sync driver.)
- **Row types are re-exported from `shared/types/`** (`$inferSelect` /
  `$inferInsert`), because services (Phase 2+) need them and the project rule
  forbids importing another module's internals.

## 1. Schema — `shared/infra/db/schema.ts`

The three tables verbatim from DESIGN.md §4: `tasks`, `subtasks`,
`status_updates`. Key facts the rest of the design leans on:

- Text UUID primary keys via `$defaultFn(() => crypto.randomUUID())`.
- `tasks.status` enum `['todo', 'in-progress', 'done']`, `tasks.priority` enum
  `['low', 'medium', 'high']`.
- `position: integer` on `tasks` (order within its status column) and
  `subtasks` (order within its task).
- `subtasks.taskId` and `statusUpdates.taskId` reference `tasks.id` with
  `onDelete: 'cascade'`.
- Timestamps as `integer(..., { mode: 'timestamp' })` with `$defaultFn`.

No deviations from DESIGN.md §4. If implementation discovers a needed change,
DESIGN.md gets updated first.

## 2. Infra — `shared/infra/db/index.ts`

- Reads `DB_FILE_NAME` from `process.env` at module load. If unset/empty,
  throws a dedicated `Error` subclass with a clear message — never silently
  creates a database at an unintended path.
- Opens the file with better-sqlite3, runs `PRAGMA foreign_keys = ON`
  (SQLite does **not** enforce `onDelete: 'cascade'` without it — cascade
  delete is a checkpoint requirement), wraps in `drizzle()` with the schema.
- Exports the `db` singleton and a `Database` type alias
  (`typeof db`) for annotations.
- No business logic — connection bootstrap only (infra layer rule).

### Config & environment

- `drizzle.config.ts` (repo root): schema `shared/infra/db/schema.ts`, out
  `./drizzle`, dialect `sqlite`, dbCredentials url from `DB_FILE_NAME`. Loads
  `.env` via `loadEnvConfig` from `@next/env` (ships with Next — no new dotenv
  dependency; drizzle-kit does not auto-load `.env`).
- `.env.example` gains `DB_FILE_NAME=devlog.db` (file in repo root).
- `.gitignore` gains `devlog.db*` (db + `-journal`/`-wal` sidecars). The
  generated `drizzle/` folder IS committed (migrations are source).

### Dependencies & scripts

- deps: `drizzle-orm`, `better-sqlite3`; devDeps: `drizzle-kit`,
  `@types/better-sqlite3`.
- `package.json` scripts: `db:generate` → `drizzle-kit generate`,
  `db:migrate` → `drizzle-kit migrate`.
- CLAUDE.md `<commands>` section gains both scripts and the setup order note
  (`db:migrate` before first `dev`).

## 3. Types — `shared/types/`

One file per entity, derived from the schema (single source of truth):

- `shared/types/task.ts` — `Task` (`$inferSelect`), `NewTask` (`$inferInsert`),
  `TaskStatus`, `TaskPriority` (unions derived from the schema enums, e.g.
  `Task['status']`).
- `shared/types/subtask.ts` — `Subtask`, `NewSubtask`.
- `shared/types/status-update.ts` — `StatusUpdate`, `NewStatusUpdate`.

## 4. Repositories — `shared/repositories/`

Three files, each exporting a plain object whose methods wrap Drizzle queries.
Persistence only: the `max+1` rule, renumbering policy, and status transitions
are Phase 2 service logic — repositories just expose the queries those need.

### `tasks-repository.ts` — `tasksRepository`

| method | behavior |
|---|---|
| `create(data: NewTask): Task` | insert, return the created row |
| `findById(id: string): Task \| undefined` | |
| `list(): Task[]` | all tasks (needed by the agent's `listTasks` tool in Phase 4) |
| `listByStatus(status: TaskStatus): Task[]` | ordered by `position` asc |
| `update(id: string, patch: Partial<Pick<Task, 'title' \| 'description' \| 'status' \| 'priority' \| 'position'>>): Task \| undefined` | partial update; always sets `updatedAt = new Date()`; returns updated row or `undefined` if id unknown |
| `delete(id: string): boolean` | `true` if a row was deleted; cascade removes its subtasks and status updates |
| `getMaxPosition(status: TaskStatus): number \| null` | `null` for an empty column |
| `updatePositions(updates: ReadonlyArray<{ id: string; position: number; status: TaskStatus }>): void` | batch column renumbering in **one transaction** |

### `subtasks-repository.ts` — `subtasksRepository`

Same core, scoped to a task: `create`, `findById`, `listByTaskId(taskId)`
(ordered by `position` asc), `update` (partial: title / description / done /
position), `delete`, `getMaxPosition(taskId)`,
`updatePositions(ReadonlyArray<{ id; position }>)` (one transaction).

### `status-updates-repository.ts` — `statusUpdatesRepository`

Minimal: `create`, `listAll()` (ordered by `createdAt` desc — Status Log page
order), `listByTaskId(taskId)`.

## 5. Test design

The singleton+env choice makes module-load order the central risk: once
`shared/infra/db` is imported, `DB_FILE_NAME` changes have no effect. The
design neutralizes that:

- Vitest's default per-file isolation gives every test file its own module
  registry — so every test file can get its own database.
- A shared test helper (`shared/repositories/__tests__/db-test-setup.ts`)
  is the **first import** of each repository test file. At module load it:
  1. generates a unique temp path (`os.tmpdir()` + random suffix) and sets
     `process.env.DB_FILE_NAME` — *before* any infra import anywhere in the
     graph;
  2. imports the infra `db` and applies the **real generated migrations**
     programmatically (`migrate(db, { migrationsFolder: './drizzle' })` from
     `drizzle-orm/better-sqlite3/migrator`) — tests run against the same SQL
     the production database gets, not a parallel schema;
  3. registers cleanup (close connection, delete temp file) via `afterAll`.
- Repository test files then import repositories normally and test through
  the public API only.

## 6. Testing & Verification

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes
- `npm run build` — builds successfully

### Unit/integration tests (Vitest) — `npm run test`

- `shared/repositories/__tests__/tasks-repository.test.ts`
  - create returns the row: `create({title: 'A'})` → row has generated `id`,
    defaults `status='todo'`, `priority='medium'`, `position=0`, timestamps set
  - findById round-trip: created row → `findById(id)` deep-equals it;
    `findById('missing')` → `undefined`
  - list returns all created tasks
  - listByStatus filters and orders: tasks with positions inserted out of
    order (2, 0, 1) → returned sorted by `position` asc, other statuses absent
  - update patches and bumps updatedAt: `update(id, {title})` → new title,
    `updatedAt` ≥ previous; `update('missing', ...)` → `undefined`
  - delete: `delete(id)` → `true`, row gone; `delete('missing')` → `false`
  - getMaxPosition: empty column → `null`; column with positions 0..2 → `2`
  - updatePositions renumbers in one call: swap two rows' positions (and move
    one across statuses) → both rows reflect new `position`/`status`
- `shared/repositories/__tests__/subtasks-repository.test.ts`
  - create/findById/update/delete round-trip (incl. `done` toggle via `update`)
  - listByTaskId ordered by `position` asc, scoped to its task only
  - getMaxPosition per task; updatePositions reorders within a task
  - FK enforced: `create({taskId: 'nonexistent', ...})` **throws** — proves
    `PRAGMA foreign_keys = ON` is active (without it, cascade silently no-ops)
- `shared/repositories/__tests__/status-updates-repository.test.ts`
  - create + listByTaskId round-trip
  - listAll ordered by `createdAt` desc (insert with distinct timestamps)
- `shared/repositories/__tests__/cascade.test.ts`
  - deleting a task with subtasks and status updates → both child sets are
    gone (checkpoint requirement); unrelated tasks' children untouched
- `shared/infra/db/__tests__/db.test.ts` (does NOT import the setup helper)
  - missing env: with `DB_FILE_NAME` unset/empty, dynamic `import()` of
    `shared/infra/db` rejects with the dedicated error

### DB checks (migration smoke)

- From a clean state (no `devlog.db`): `npm run db:migrate` exits 0 and creates
  `devlog.db`.
- `node -e "const db=require('better-sqlite3')('devlog.db');console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"`
  → lists `tasks`, `subtasks`, `status_updates` (+ drizzle migrations table).
- Re-running `npm run db:migrate` is a no-op (exit 0, no error).

### E2E tests (Playwright)

- Skipped — no UI change in this phase. Existing `e2e/smoke.spec.ts` must
  still pass (`npm run test:e2e`) to prove the app boots with the new infra
  module present.

### Viewport screenshots

- Skipped — no visual change.

### API smoke (curl)

- Skipped — no route handlers or Server Actions in this phase.

### Requirement coverage

- Drizzle schema for three tables per DESIGN.md §4 → migration smoke (tables
  exist); all Vitest suites run against migrated schema
- SQLite connection in `shared/infra/` → every repository test exercises it;
  missing `DB_FILE_NAME` throws → `db.test.ts` missing-env case
- Migrations generated and applied → `db:generate` output committed in
  `drizzle/`; migration smoke; tests apply the same migrations to temp DBs
- Repositories: CRUD for all three tables → per-repository CRUD cases
- Position-aware queries → `listByStatus`/`listByTaskId` ordering cases,
  `getMaxPosition`, `updatePositions` cases
- Cascade delete of subtasks + status updates → `cascade.test.ts`
- FK enforcement (`PRAGMA foreign_keys`) → subtask FK-violation case
- Checkpoint "Vitest integration tests against a temp SQLite file" → test
  design §5 (per-file temp DB via setup helper)

## Out of scope (later phases)

Task service / business rules (`max+1`, renumbering policy, status
transitions) — Phase 2. Server Actions, board UI — Phase 2. zod validation —
arrives at the controller boundary in Phase 2 (repositories are an internal
layer, not an external boundary). Seed data — not needed.
