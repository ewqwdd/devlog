# Phase 1 — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested persistence layer: Drizzle schema for `tasks`/`subtasks`/`status_updates`, better-sqlite3 singleton in `shared/infra/db/`, generated migrations applied via `npm run db:migrate`, and three repositories with CRUD + position-aware queries.

**Architecture:** Repositories (`shared/repositories/`) import the `db` singleton from `shared/infra/db/`, which reads `DB_FILE_NAME` from env and enables `PRAGMA foreign_keys`. Tests get a per-test-file temp SQLite database by setting `DB_FILE_NAME` in a setup helper that is the first import of every repository test file, then applying the real generated migrations. All repository methods are synchronous (better-sqlite3 is synchronous by design).

**Tech Stack:** Drizzle ORM + drizzle-kit, better-sqlite3, Vitest. Spec: `docs/superpowers/specs/2026-06-11-phase-1-data-layer-design.md`.

**Project style constraints (from Phase 0 — follow exactly):**
- `process.env` access via brackets: `process.env["DB_FILE_NAME"]` (`noPropertyAccessFromIndexSignature`).
- Explicit return types on every named function and object method (Biome `useExplicitReturnType`). Inline callbacks passed as arguments (e.g. `it("...", () => {...})`, `.map((t) => t.title)`) do not need them (Phase 0 code passes lint without).
- No `any`, no `@ts-ignore`/`@ts-nocheck`/unjustified `biome-ignore`.
- Never `console.log` (irrelevant here — no logging needed in this phase).

---

### Task 1: Dependencies, scripts, env, configs

**Files:**
- Modify: `package.json` (deps via npm, scripts)
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `.env` (local, untracked)
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

```powershell
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit "@types/better-sqlite3"
```

Expected: installs succeed; better-sqlite3 uses a prebuilt Windows binary (no node-gyp errors).

- [ ] **Step 2: Add npm scripts**

In `package.json` `"scripts"`, after `"format"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
```

- [ ] **Step 3: Ignore the local database files**

Append to `.gitignore`:

```
# sqlite (local db + -journal/-wal sidecars)
devlog.db*
```

- [ ] **Step 4: Add DB_FILE_NAME to env files**

Append to `.env.example`:

```
DB_FILE_NAME=devlog.db
```

For local `.env`: if the file does not exist, copy `.env.example` to `.env`. If it exists, append the `DB_FILE_NAME=devlog.db` line only if no `DB_FILE_NAME` entry is present. Do NOT touch any other lines in an existing `.env`.

- [ ] **Step 5: Add the `@/` alias to vitest config**

Vitest does not read tsconfig `paths`; without this, test files importing `@/shared/...` fail to resolve. Replace `vitest.config.ts` with:

```ts
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": rootDir },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**", ".claude/**"],
  },
});
```

- [ ] **Step 6: Verify nothing broke**

```powershell
npm run typecheck; npm run lint; npm run test
```

Expected: all pass (logger tests still green).

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json .gitignore .env.example vitest.config.ts
git commit -m "chore: add drizzle-orm, better-sqlite3, db scripts, vitest alias"
```

---

### Task 2: Schema + drizzle config + generate the migration

**Files:**
- Create: `shared/infra/db/schema.ts`
- Create: `drizzle.config.ts`
- Create (generated): `drizzle/0000_*.sql`, `drizzle/meta/*`
- Modify: `biome.json` (exclude generated `drizzle/` from lint/format)

- [ ] **Step 1: Write the schema (verbatim from DESIGN.md §4)**

`shared/infra/db/schema.ts`:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["todo", "in-progress", "done"] })
    .notNull()
    .default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high"] })
    .notNull()
    .default("medium"),
  position: integer("position").notNull().default(0), // order within its column
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const subtasks = sqliteTable("subtasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0), // order within a task
  done: integer("done", { mode: "boolean" }).notNull().default(false),
});

export const statusUpdates = sqliteTable("status_updates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

If `npm run lint` later complains about missing return types on the `$defaultFn`/`references` arrows, annotate them (`(): string =>`, `(): Date =>`) — but Phase 0 evidence says inline argument callbacks are not flagged.

- [ ] **Step 2: Write drizzle.config.ts (repo root)**

drizzle-kit does not auto-load `.env`; `loadEnvConfig` from `@next/env` (ships with Next, no new dependency) loads it the same way Next does.

```ts
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const dbFileName = process.env["DB_FILE_NAME"];
if (!dbFileName) {
  throw new Error("DB_FILE_NAME is not set. Copy .env.example to .env first.");
}

export default defineConfig({
  schema: "./shared/infra/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: dbFileName },
});
```

- [ ] **Step 3: Exclude generated migrations from Biome**

In `biome.json`, extend `files.includes` (same `!!` pattern Phase 0 used for `.claude`):

```json
"includes": ["**", "!!.claude", "!!.agents", "!!drizzle"]
```

- [ ] **Step 4: Generate the migration**

```powershell
npm run db:generate
```

Expected: creates `drizzle/0000_<name>.sql` and `drizzle/meta/` (journal + snapshot). Open the `.sql` file and verify: three `CREATE TABLE` statements; both `task_id` columns declare `FOREIGN KEY ... REFERENCES tasks(id) ... ON DELETE cascade`.

- [ ] **Step 5: Verify static checks**

```powershell
npm run typecheck; npm run lint
```

Expected: pass.

- [ ] **Step 6: Commit (generated migrations ARE source — commit them)**

```powershell
git add shared/infra/db/schema.ts drizzle.config.ts drizzle/ biome.json
git commit -m "feat: drizzle schema for tasks/subtasks/status_updates + initial migration"
```

---

### Task 3: Infra db singleton (TDD)

**Files:**
- Create: `shared/infra/db/index.ts`
- Test: `shared/infra/db/__tests__/db.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/infra/db/__tests__/db.test.ts` — deliberately does NOT import the module statically and does NOT use the repositories' setup helper (it needs the un-initialized state):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared/infra/db", () => {
  it("throws a clear error when DB_FILE_NAME is not set", async () => {
    vi.stubEnv("DB_FILE_NAME", undefined);
    await expect(import("@/shared/infra/db")).rejects.toThrow(/DB_FILE_NAME/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
npx vitest run shared/infra/db/__tests__/db.test.ts
```

Expected: FAIL — the import rejects with "Cannot find module"/"Failed to load", whose message does not match `/DB_FILE_NAME/`.

- [ ] **Step 3: Implement the module**

`shared/infra/db/index.ts`:

```ts
import DatabaseConstructor from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

const dbFileName = process.env["DB_FILE_NAME"];
if (!dbFileName) {
  throw new DatabaseConfigurationError(
    "DB_FILE_NAME is not set. Copy .env.example to .env and set DB_FILE_NAME.",
  );
}

const client = new DatabaseConstructor(dbFileName);
// SQLite does not enforce ON DELETE CASCADE without this pragma.
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });
export type Database = typeof db;
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npx vitest run shared/infra/db/__tests__/db.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Static checks + commit**

```powershell
npm run typecheck; npm run lint
git add shared/infra/db/
git commit -m "feat: sqlite connection singleton with env validation and FK pragma"
```

---

### Task 4: Row types in shared/types

**Files:**
- Create: `shared/types/task.ts`
- Create: `shared/types/subtask.ts`
- Create: `shared/types/status-update.ts`

- [ ] **Step 1: Write the three type files**

`shared/types/task.ts`:

```ts
import type { tasks } from "@/shared/infra/db/schema";

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
```

`shared/types/subtask.ts`:

```ts
import type { subtasks } from "@/shared/infra/db/schema";

export type Subtask = typeof subtasks.$inferSelect;
export type NewSubtask = typeof subtasks.$inferInsert;
```

`shared/types/status-update.ts`:

```ts
import type { statusUpdates } from "@/shared/infra/db/schema";

export type StatusUpdate = typeof statusUpdates.$inferSelect;
export type NewStatusUpdate = typeof statusUpdates.$inferInsert;
```

- [ ] **Step 2: Verify + commit**

Type-only files — typecheck IS the test:

```powershell
npm run typecheck; npm run lint
git add shared/types/
git commit -m "feat: row types derived from drizzle schema"
```

---

### Task 5: Test setup helper (per-file temp DB)

**Files:**
- Create: `shared/repositories/__tests__/db-test-setup.ts`

- [ ] **Step 1: Write the helper**

Critical mechanics: ESM hoists static imports, so this file must NOT statically import anything that touches `shared/infra/db` — the env assignment has to run first, then the infra module is pulled in via dynamic `import()` (top-level await). Every repository test file imports this helper as its FIRST import; ESM evaluates it (including the top-level awaits) before the next import is evaluated. Vitest's default per-file isolation gives each test file its own module registry, hence its own temp DB.

```ts
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

const tempDbFile = join(tmpdir(), `devlog-test-${randomUUID()}.db`);
process.env["DB_FILE_NAME"] = tempDbFile;

// Dynamic imports: must happen AFTER the env assignment above.
const { db } = await import("@/shared/infra/db");
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { tasks } = await import("@/shared/infra/db/schema");

// Same SQL the production database gets — not a parallel schema.
migrate(db, { migrationsFolder: "./drizzle" });

beforeEach(() => {
  // Wiping tasks cascades to subtasks and status_updates (FK pragma is on).
  db.delete(tasks).run();
});

afterAll(() => {
  db.$client.close();
  if (existsSync(tempDbFile)) {
    unlinkSync(tempDbFile);
  }
});
```

Note: `migrationsFolder: "./drizzle"` is relative to the Vitest working directory (repo root) — correct as long as tests run via npm scripts from the root.

- [ ] **Step 2: Verify + commit**

```powershell
npm run typecheck; npm run lint
git add shared/repositories/__tests__/db-test-setup.ts
git commit -m "test: per-file temp sqlite setup helper applying real migrations"
```

(It has no tests of its own; Task 6 exercises it end-to-end.)

---

### Task 6: Tasks repository (TDD)

**Files:**
- Create: `shared/repositories/tasks-repository.ts`
- Test: `shared/repositories/__tests__/tasks-repository.test.ts`

- [ ] **Step 1: Write the failing tests**

`shared/repositories/__tests__/tasks-repository.test.ts` (the side-effect import MUST stay first; Biome's import sorting treats side-effect imports as barriers and won't move it):

```ts
import "./db-test-setup";
import { describe, expect, it } from "vitest";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

describe("tasksRepository", () => {
  it("create returns the row with generated id and defaults", () => {
    const task = tasksRepository.create({ title: "A" });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium");
    expect(task.position).toBe(0);
    expect(task.description).toBe("");
    expect(task.createdAt).toBeInstanceOf(Date);
    expect(task.updatedAt).toBeInstanceOf(Date);
  });

  it("findById returns the created row, undefined for unknown id", () => {
    const created = tasksRepository.create({ title: "find me" });
    expect(tasksRepository.findById(created.id)).toEqual(created);
    expect(tasksRepository.findById("missing")).toBeUndefined();
  });

  it("list returns all tasks", () => {
    tasksRepository.create({ title: "one" });
    tasksRepository.create({ title: "two" });
    expect(tasksRepository.list()).toHaveLength(2);
  });

  it("listByStatus filters by status and orders by position", () => {
    tasksRepository.create({ title: "third", status: "todo", position: 2 });
    tasksRepository.create({ title: "first", status: "todo", position: 0 });
    tasksRepository.create({ title: "second", status: "todo", position: 1 });
    tasksRepository.create({ title: "other", status: "done", position: 0 });
    const todos = tasksRepository.listByStatus("todo");
    expect(todos.map((t) => t.title)).toEqual(["first", "second", "third"]);
  });

  it("update patches fields, bumps updatedAt, undefined for unknown id", () => {
    const created = tasksRepository.create({ title: "old" });
    const updated = tasksRepository.update(created.id, { title: "new" });
    expect(updated?.title).toBe("new");
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    );
    expect(tasksRepository.update("missing", { title: "x" })).toBeUndefined();
  });

  it("delete removes the row and reports whether anything was deleted", () => {
    const created = tasksRepository.create({ title: "doomed" });
    expect(tasksRepository.delete(created.id)).toBe(true);
    expect(tasksRepository.findById(created.id)).toBeUndefined();
    expect(tasksRepository.delete("missing")).toBe(false);
  });

  it("getMaxPosition returns null for an empty column and the max otherwise", () => {
    expect(tasksRepository.getMaxPosition("done")).toBeNull();
    tasksRepository.create({ title: "t0", status: "todo", position: 0 });
    tasksRepository.create({ title: "t2", status: "todo", position: 2 });
    expect(tasksRepository.getMaxPosition("todo")).toBe(2);
  });

  it("updatePositions renumbers and moves across statuses in one call", () => {
    const a = tasksRepository.create({ title: "a", status: "todo", position: 0 });
    const b = tasksRepository.create({ title: "b", status: "todo", position: 1 });
    tasksRepository.updatePositions([
      { id: a.id, position: 1, status: "todo" },
      { id: b.id, position: 0, status: "in-progress" },
    ]);
    expect(tasksRepository.findById(a.id)?.position).toBe(1);
    const movedB = tasksRepository.findById(b.id);
    expect(movedB?.status).toBe("in-progress");
    expect(movedB?.position).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npx vitest run shared/repositories/__tests__/tasks-repository.test.ts
```

Expected: FAIL — cannot resolve `@/shared/repositories/tasks-repository`.

- [ ] **Step 3: Implement the repository**

`shared/repositories/tasks-repository.ts`. Patch interfaces are hand-written (not `Partial<Pick<...>>`) so optional properties don't carry `| undefined` — required under `exactOptionalPropertyTypes`:

```ts
import { asc, eq, max } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { tasks } from "@/shared/infra/db/schema";
import type {
  NewTask,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/shared/types/task";

export interface TaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly position?: number;
}

export interface TaskPositionUpdate {
  readonly id: string;
  readonly position: number;
  readonly status: TaskStatus;
}

export const tasksRepository = {
  create(data: NewTask): Task {
    return db.insert(tasks).values(data).returning().get();
  },

  findById(id: string): Task | undefined {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  },

  list(): Task[] {
    return db.select().from(tasks).all();
  },

  listByStatus(status: TaskStatus): Task[] {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.status, status))
      .orderBy(asc(tasks.position))
      .all();
  },

  update(id: string, patch: TaskPatch): Task | undefined {
    return db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  },

  delete(id: string): boolean {
    return db.delete(tasks).where(eq(tasks.id, id)).run().changes > 0;
  },

  getMaxPosition(status: TaskStatus): number | null {
    const row = db
      .select({ value: max(tasks.position) })
      .from(tasks)
      .where(eq(tasks.status, status))
      .get();
    return row?.value ?? null;
  },

  updatePositions(updates: ReadonlyArray<TaskPositionUpdate>): void {
    db.transaction((tx) => {
      for (const update of updates) {
        tx.update(tasks)
          .set({ position: update.position, status: update.status })
          .where(eq(tasks.id, update.id))
          .run();
      }
    });
  },
};
```

(`updatePositions` deliberately does not bump `updatedAt`: renumbering is a mechanical shift of many rows, not a content edit.)

- [ ] **Step 4: Run to verify pass**

```powershell
npx vitest run shared/repositories/__tests__/tasks-repository.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Static checks + commit**

```powershell
npm run typecheck; npm run lint
git add shared/repositories/
git commit -m "feat: tasks repository with position-aware queries"
```

---

### Task 7: Subtasks repository (TDD)

**Files:**
- Create: `shared/repositories/subtasks-repository.ts`
- Test: `shared/repositories/__tests__/subtasks-repository.test.ts`

- [ ] **Step 1: Write the failing tests**

`shared/repositories/__tests__/subtasks-repository.test.ts`:

```ts
import "./db-test-setup";
import { describe, expect, it } from "vitest";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

function createParentTask(): string {
  return tasksRepository.create({ title: "parent" }).id;
}

describe("subtasksRepository", () => {
  it("create returns the row with generated id and defaults", () => {
    const taskId = createParentTask();
    const subtask = subtasksRepository.create({ taskId, title: "S" });
    expect(subtask.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(subtask.done).toBe(false);
    expect(subtask.position).toBe(0);
    expect(subtask.description).toBe("");
  });

  it("findById returns the row, undefined for unknown id", () => {
    const taskId = createParentTask();
    const created = subtasksRepository.create({ taskId, title: "find me" });
    expect(subtasksRepository.findById(created.id)).toEqual(created);
    expect(subtasksRepository.findById("missing")).toBeUndefined();
  });

  it("listByTaskId is ordered by position and scoped to its task", () => {
    const taskA = createParentTask();
    const taskB = createParentTask();
    subtasksRepository.create({ taskId: taskA, title: "second", position: 1 });
    subtasksRepository.create({ taskId: taskA, title: "first", position: 0 });
    subtasksRepository.create({ taskId: taskB, title: "other", position: 0 });
    expect(subtasksRepository.listByTaskId(taskA).map((s) => s.title)).toEqual([
      "first",
      "second",
    ]);
  });

  it("update patches fields including the done toggle", () => {
    const taskId = createParentTask();
    const created = subtasksRepository.create({ taskId, title: "todo it" });
    const updated = subtasksRepository.update(created.id, {
      done: true,
      title: "done it",
    });
    expect(updated?.done).toBe(true);
    expect(updated?.title).toBe("done it");
    expect(subtasksRepository.update("missing", { done: true })).toBeUndefined();
  });

  it("delete removes the row and reports whether anything was deleted", () => {
    const taskId = createParentTask();
    const created = subtasksRepository.create({ taskId, title: "doomed" });
    expect(subtasksRepository.delete(created.id)).toBe(true);
    expect(subtasksRepository.findById(created.id)).toBeUndefined();
    expect(subtasksRepository.delete("missing")).toBe(false);
  });

  it("getMaxPosition is scoped per task", () => {
    const taskA = createParentTask();
    const taskB = createParentTask();
    subtasksRepository.create({ taskId: taskA, title: "s", position: 3 });
    expect(subtasksRepository.getMaxPosition(taskA)).toBe(3);
    expect(subtasksRepository.getMaxPosition(taskB)).toBeNull();
  });

  it("updatePositions reorders within a task in one call", () => {
    const taskId = createParentTask();
    const first = subtasksRepository.create({ taskId, title: "a", position: 0 });
    const second = subtasksRepository.create({ taskId, title: "b", position: 1 });
    subtasksRepository.updatePositions([
      { id: first.id, position: 1 },
      { id: second.id, position: 0 },
    ]);
    expect(subtasksRepository.listByTaskId(taskId).map((s) => s.title)).toEqual([
      "b",
      "a",
    ]);
  });

  it("throws when creating a subtask for a nonexistent task (FK enforced)", () => {
    expect(() =>
      subtasksRepository.create({ taskId: "nonexistent", title: "orphan" }),
    ).toThrow(/FOREIGN KEY/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npx vitest run shared/repositories/__tests__/subtasks-repository.test.ts
```

Expected: FAIL — cannot resolve `@/shared/repositories/subtasks-repository`.

- [ ] **Step 3: Implement the repository**

`shared/repositories/subtasks-repository.ts`:

```ts
import { asc, eq, max } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { subtasks } from "@/shared/infra/db/schema";
import type { NewSubtask, Subtask } from "@/shared/types/subtask";

export interface SubtaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly done?: boolean;
  readonly position?: number;
}

export interface SubtaskPositionUpdate {
  readonly id: string;
  readonly position: number;
}

export const subtasksRepository = {
  create(data: NewSubtask): Subtask {
    return db.insert(subtasks).values(data).returning().get();
  },

  findById(id: string): Subtask | undefined {
    return db.select().from(subtasks).where(eq(subtasks.id, id)).get();
  },

  listByTaskId(taskId: string): Subtask[] {
    return db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.position))
      .all();
  },

  update(id: string, patch: SubtaskPatch): Subtask | undefined {
    return db
      .update(subtasks)
      .set({ ...patch })
      .where(eq(subtasks.id, id))
      .returning()
      .get();
  },

  delete(id: string): boolean {
    return db.delete(subtasks).where(eq(subtasks.id, id)).run().changes > 0;
  },

  getMaxPosition(taskId: string): number | null {
    const row = db
      .select({ value: max(subtasks.position) })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .get();
    return row?.value ?? null;
  },

  updatePositions(updates: ReadonlyArray<SubtaskPositionUpdate>): void {
    db.transaction((tx) => {
      for (const update of updates) {
        tx.update(subtasks)
          .set({ position: update.position })
          .where(eq(subtasks.id, update.id))
          .run();
      }
    });
  },
};
```

- [ ] **Step 4: Run to verify pass**

```powershell
npx vitest run shared/repositories/__tests__/subtasks-repository.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Static checks + commit**

```powershell
npm run typecheck; npm run lint
git add shared/repositories/
git commit -m "feat: subtasks repository with per-task position queries"
```

---

### Task 8: Status-updates repository (TDD)

**Files:**
- Create: `shared/repositories/status-updates-repository.ts`
- Test: `shared/repositories/__tests__/status-updates-repository.test.ts`

- [ ] **Step 1: Write the failing tests**

`shared/repositories/__tests__/status-updates-repository.test.ts`:

```ts
import "./db-test-setup";
import { describe, expect, it } from "vitest";
import { statusUpdatesRepository } from "@/shared/repositories/status-updates-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

describe("statusUpdatesRepository", () => {
  it("create + listByTaskId round-trip", () => {
    const task = tasksRepository.create({ title: "t" });
    const update = statusUpdatesRepository.create({
      taskId: task.id,
      text: "shipped it",
    });
    expect(update.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(statusUpdatesRepository.listByTaskId(task.id)).toEqual([update]);
  });

  it("listAll returns updates newest first", () => {
    const task = tasksRepository.create({ title: "t" });
    statusUpdatesRepository.create({
      taskId: task.id,
      text: "older",
      createdAt: new Date(2026, 0, 1),
    });
    statusUpdatesRepository.create({
      taskId: task.id,
      text: "newer",
      createdAt: new Date(2026, 0, 2),
    });
    expect(statusUpdatesRepository.listAll().map((u) => u.text)).toEqual([
      "newer",
      "older",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npx vitest run shared/repositories/__tests__/status-updates-repository.test.ts
```

Expected: FAIL — cannot resolve `@/shared/repositories/status-updates-repository`.

- [ ] **Step 3: Implement the repository**

`shared/repositories/status-updates-repository.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { statusUpdates } from "@/shared/infra/db/schema";
import type {
  NewStatusUpdate,
  StatusUpdate,
} from "@/shared/types/status-update";

export const statusUpdatesRepository = {
  create(data: NewStatusUpdate): StatusUpdate {
    return db.insert(statusUpdates).values(data).returning().get();
  },

  listAll(): StatusUpdate[] {
    return db
      .select()
      .from(statusUpdates)
      .orderBy(desc(statusUpdates.createdAt))
      .all();
  },

  listByTaskId(taskId: string): StatusUpdate[] {
    return db
      .select()
      .from(statusUpdates)
      .where(eq(statusUpdates.taskId, taskId))
      .all();
  },
};
```

- [ ] **Step 4: Run to verify pass**

```powershell
npx vitest run shared/repositories/__tests__/status-updates-repository.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Static checks + commit**

```powershell
npm run typecheck; npm run lint
git add shared/repositories/
git commit -m "feat: status-updates repository"
```

---

### Task 9: Cascade-delete test (checkpoint requirement)

**Files:**
- Test: `shared/repositories/__tests__/cascade.test.ts`

This is a verification of schema + pragma working together — the production code already exists, so the test should pass on first run. If it fails, the migration or the FK pragma is broken: stop and fix that, do not adjust the test.

- [ ] **Step 1: Write the test**

```ts
import "./db-test-setup";
import { describe, expect, it } from "vitest";
import { statusUpdatesRepository } from "@/shared/repositories/status-updates-repository";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

describe("cascade delete", () => {
  it("deleting a task removes its subtasks and status updates, leaving others intact", () => {
    const doomed = tasksRepository.create({ title: "doomed" });
    const survivor = tasksRepository.create({ title: "survivor" });
    subtasksRepository.create({ taskId: doomed.id, title: "doomed sub" });
    const keptSub = subtasksRepository.create({
      taskId: survivor.id,
      title: "kept sub",
    });
    statusUpdatesRepository.create({ taskId: doomed.id, text: "doomed update" });
    statusUpdatesRepository.create({ taskId: survivor.id, text: "kept update" });

    tasksRepository.delete(doomed.id);

    expect(subtasksRepository.listByTaskId(doomed.id)).toEqual([]);
    expect(statusUpdatesRepository.listByTaskId(doomed.id)).toEqual([]);
    expect(subtasksRepository.listByTaskId(survivor.id)).toEqual([keptSub]);
    expect(statusUpdatesRepository.listByTaskId(survivor.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it**

```powershell
npx vitest run shared/repositories/__tests__/cascade.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add shared/repositories/__tests__/cascade.test.ts
git commit -m "test: cascade delete of subtasks and status updates"
```

---

### Task 10: Migration smoke + docs

**Files:**
- Modify: `CLAUDE.md` (commands section)
- Local artifact: `devlog.db` (gitignored)

- [ ] **Step 1: Fresh migrate**

```powershell
if (Test-Path devlog.db) { Remove-Item devlog.db* -Confirm:$false }
npm run db:migrate
```

Expected: exit 0; `devlog.db` exists.

- [ ] **Step 2: Verify tables**

```powershell
node -e "const db = require('better-sqlite3')('devlog.db'); console.log(db.prepare(`"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`").all().map(r => r.name).join(','))"
```

Expected output: `__drizzle_migrations,status_updates,subtasks,tasks`

- [ ] **Step 3: Re-run is a no-op**

```powershell
npm run db:migrate
```

Expected: exit 0, no error, no new migration applied.

- [ ] **Step 4: Update CLAUDE.md commands section**

In the `<commands>` block, after the `npm run format` line, add:

```markdown
- `npm run db:generate` — generate a Drizzle migration from schema changes
- `npm run db:migrate` — apply migrations (run once before first `npm run dev`)
```

- [ ] **Step 5: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs: record db:generate/db:migrate commands"
```

---

### Task 11: Run the full verification plan

Execute the spec's Testing & Verification section end to end. Every command must pass before the phase is declared done.

- [ ] **Step 1: Static checks**

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Full Vitest suite**

```powershell
npm run test
```

Expected: PASS, 0 failures — 23 tests: 3 logger, 1 infra db, 8 tasks repo, 8 subtasks repo, 2 status-updates repo, 1 cascade.

- [ ] **Step 3: E2E smoke still green**

```powershell
npm run test:e2e
```

Expected: PASS — proves the app still boots with the new infra module present.

- [ ] **Step 4: Confirm migration smoke results from Task 10**

Already executed in Task 10; re-run Step 2 of Task 10 if `devlog.db` was deleted since. Expected table list unchanged.

- [ ] **Step 5: Check off Phase 1 in the roadmap**

In `docs/ROADMAP.md`, change `- [ ] Phase 1 — Data layer` to `- [x] Phase 1 — Data layer`.

```powershell
git add docs/ROADMAP.md
git commit -m "docs: check off Phase 1"
```
