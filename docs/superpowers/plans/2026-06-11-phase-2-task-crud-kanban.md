# Phase 2 — Task CRUD + Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the visible tracker on top of the Phase 1 data layer — an ordering-owning `tasks` service, zod-validated Server Actions, a three-column dnd-kit board, and routed create/view modals with per-field autosave.

**Architecture:** A pure `computeMove`/`applyMove` pair owns all renumbering math (the single source of ordering truth, unit-tested exhaustively). `tasksService` wraps it and persists through the Phase 1 `tasksRepository.updatePositions` transaction. Server Actions are the zod boundary returning a `{ok, data|error}` union, never throwing to the client. The board lives entirely client-side in React Query; dnd-kit drags produce `{taskId, toStatus, toIndex}` intent, the client optimistically applies the same permutation the server computes, and `onSettled` invalidation lets the server win. Modals are Next.js intercepting routes with standalone fallbacks.

**Tech Stack:** Next.js App Router + TypeScript strict, Drizzle + SQLite (Phase 1), zod v4, `@tanstack/react-query`, `@dnd-kit/core` + `@dnd-kit/sortable`, shadcn/ui (dialog, alert-dialog, select, input, textarea, sonner, badge, skeleton), Vitest (node env) + Playwright.

**Testing focus (per request):** ordering math and drag-and-drop are the heart. Tasks 3 (`computeMove`/`applyMove` unit tests), 4 (service ordering against temp SQLite), and 12 (e2e dnd) carry the bulk of the test code. UI components have no unit tests (Vitest runs in the `node` environment — no jsdom); they are verified through e2e + screenshots.

---

## File structure

```
shared/types/task.ts                       MODIFY — add Board type; re-home TaskPositionUpdate
shared/types/action-result.ts              CREATE — ActionResult<T> discriminated union
shared/lib/task-constants.ts               CREATE — TASK_STATUSES, TASK_PRIORITIES tuples
shared/repositories/tasks-repository.ts     MODIFY — import TaskPositionUpdate from shared/types
services/task-not-found-error.ts           CREATE — TaskNotFoundError (shared by compute-move + service)
services/compute-move.ts                   CREATE — applyMove + computeMove (pure, no DB)
services/tasks-service.ts                  CREATE — ordering business logic
services/__tests__/compute-move.test.ts    CREATE — ordering unit tests (CORE)
services/__tests__/tasks-service.test.ts   CREATE — service integration tests (temp SQLite)
app/actions/tasks.ts                       CREATE — Server Actions + zod schemas (controller)
app/actions/__tests__/tasks.test.ts        CREATE — action boundary tests (temp SQLite)
components/providers.tsx                    CREATE — QueryClientProvider
components/task-card.tsx                    CREATE — pure display card
app/layout.tsx                             MODIFY — mount Providers + @modal slot + Toaster
app/page.tsx                               MODIFY — render <Board>
app/_components/board.tsx                  CREATE — DndContext + React Query + columns
app/_components/board-column.tsx           CREATE — droppable column + SortableContext
app/_components/sortable-task-card.tsx     CREATE — useSortable wrapper around TaskCard
app/_components/task-form.tsx              CREATE — create form (shared by modal + page)
app/_components/task-modal-content.tsx     CREATE — autosave task view (shared by modal + page)
app/@modal/default.tsx                     CREATE — empty slot (null)
app/@modal/(.)tasks/new/page.tsx           CREATE — intercepted create modal
app/@modal/(.)tasks/[id]/page.tsx          CREATE — intercepted task modal
app/tasks/new/page.tsx                     CREATE — standalone create page (fallback)
app/tasks/[id]/page.tsx                    CREATE — standalone task page (fallback)
e2e/global-setup.ts                        CREATE — fresh e2e DB + migrate
e2e/helpers.ts                             CREATE — dragCard + columnTitles helpers
e2e/board.spec.ts                          CREATE — dnd e2e (CORE)
e2e/task-modal.spec.ts                     CREATE — modal e2e
playwright.config.ts                       MODIFY — webServer.env + globalSetup
.gitignore                                 MODIFY — add .e2e/
```

**Key conventions locked from Phase 1 (do not deviate):**
- Import alias `@/` → project root. Repositories/services import `db` via `@/shared/infra/db`.
- `tsconfig` is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Read `process.env["DB_FILE_NAME"]` (bracket), guard array access (`arr[i]` is `T | undefined`).
- Repository/service modules are object literals: `export const xRepository = { method(): T {...} }`, explicit return types.
- Vitest `node` env, `include: ["**/*.test.ts"]`. Tests start with `import "./db-test-setup"` (relative) for temp SQLite. Setup wipes the `tasks` table in `beforeEach`.
- shadcn output dir is `@/shared/ui`. Install with `npx shadcn@latest add <name>`.
- Logger: `import { logger } from "@/shared/lib/logger"`.

---

## Task 0: Install dependencies and shadcn components

**Files:**
- Modify: `package.json` (via npm), `shared/ui/*` (via shadcn)

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities zod
```
Expected: added to `dependencies`, no peer-dep errors.

- [ ] **Step 2: Install shadcn components**

Run:
```bash
npx shadcn@latest add dialog alert-dialog select input textarea sonner badge skeleton
```
Expected: files created under `shared/ui/` (`dialog.tsx`, `alert-dialog.tsx`, `select.tsx`, `input.tsx`, `textarea.tsx`, `sonner.tsx`, `badge.tsx`, `skeleton.tsx`); `sonner` npm package added. If the CLI prompts, accept defaults (it reads `components.json`).

- [ ] **Step 3: Verify install**

Run: `npm run typecheck`
Expected: 0 errors (new files compile; nothing wired yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json shared/ui components.json
git commit -m "chore: add react-query, dnd-kit, zod, shadcn board components"
```

---

## Task 1: Shared types and constants

**Files:**
- Create: `shared/lib/task-constants.ts`
- Create: `shared/types/action-result.ts`
- Modify: `shared/types/task.ts`
- Modify: `shared/repositories/tasks-repository.ts:19-23`

- [ ] **Step 1: Create the status/priority constant tuples**

`shared/lib/task-constants.ts`:
```typescript
import type { TaskPriority, TaskStatus } from "@/shared/types/task";

// Source of ordering/iteration for columns, zod enums, and selects.
// `as const` preserves the literal tuple (so z.enum infers the exact union);
// `satisfies` guards against drift from the schema enums in shared/infra/db/schema.ts.
export const TASK_STATUSES = ["todo", "in-progress", "done"] as const satisfies readonly TaskStatus[];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const satisfies readonly TaskPriority[];
```

- [ ] **Step 2: Add `Board` type and re-home `TaskPositionUpdate`**

Edit `shared/types/task.ts` — append after the existing exports:
```typescript
// One operation moves/renumbers tasks; the repository transaction consumes these.
export interface TaskPositionUpdate {
  readonly id: string;
  readonly position: number;
  readonly status: TaskStatus;
}

// The whole board, grouped by column, each column ordered by position asc.
export type Board = Record<TaskStatus, Task[]>;
```

- [ ] **Step 3: Point the repository at the shared type**

In `shared/repositories/tasks-repository.ts`, delete the local `TaskPositionUpdate` interface (lines 19-23) and import it instead. Change the type import block:
```typescript
import type {
  NewTask,
  Task,
  TaskPositionUpdate,
  TaskPriority,
  TaskStatus,
} from "@/shared/types/task";
```
Leave `TaskPatch` as-is in the repository. The `updatePositions(updates: ReadonlyArray<TaskPositionUpdate>)` signature is unchanged.

- [ ] **Step 4: Create the action result union**

`shared/types/action-result.ts`:
```typescript
// One response shape across all Server Actions. Actions never throw to the client.
export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };
```

- [ ] **Step 5: Verify and run existing tests**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run test`
Expected: existing Phase 1 repository tests still pass (the `TaskPositionUpdate` move is behavior-neutral).

- [ ] **Step 6: Commit**

```bash
git add shared/lib/task-constants.ts shared/types/action-result.ts shared/types/task.ts shared/repositories/tasks-repository.ts
git commit -m "feat: shared board types, status/priority constants, ActionResult"
```

---

## Task 2: TaskNotFoundError

**Files:**
- Create: `services/task-not-found-error.ts`

Lives in its own module so both `compute-move.ts` (lower) and `tasks-service.ts` (higher) import it without a cycle.

- [ ] **Step 1: Create the error**

`services/task-not-found-error.ts`:
```typescript
export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = "TaskNotFoundError";
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add services/task-not-found-error.ts
git commit -m "feat: TaskNotFoundError"
```

---

## Task 3: computeMove + applyMove (pure ordering math) — CORE

**Files:**
- Create: `services/compute-move.ts`
- Test: `services/__tests__/compute-move.test.ts`

`applyMove` returns a full reindexed `Board` (used client-side for optimistic updates and drag preview). `computeMove` diffs that result against the original board and returns only the changed rows (the minimal transaction the repository writes). Both throw `TaskNotFoundError` for an unknown id. Write the tests first.

- [ ] **Step 1: Write the failing tests**

`services/__tests__/compute-move.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { applyMove, computeMove } from "@/services/compute-move";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import type { Board, Task, TaskStatus } from "@/shared/types/task";

// Build a dense board from a map of status -> ordered titles.
function makeBoard(spec: Partial<Record<TaskStatus, string[]>>): Board {
  const board: Board = { todo: [], "in-progress": [], done: [] };
  for (const status of ["todo", "in-progress", "done"] as TaskStatus[]) {
    board[status] = (spec[status] ?? []).map((title, index) => ({
      id: title, // titles double as ids in these pure tests
      title,
      description: "",
      status,
      priority: "medium",
      position: index,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })) satisfies Task[];
  }
  return board;
}

// Flatten an applyMove result column to "id@position" for dense assertions.
function dense(board: Board, status: TaskStatus): string[] {
  return board[status].map((t) => `${t.id}@${t.position}`);
}

describe("computeMove — in-column", () => {
  it("move up (position 5 -> 0): tasks 0..4 each +1, moved gets 0, stays dense 0..5", () => {
    const board = makeBoard({ todo: ["a", "b", "c", "d", "e", "f"] });
    const next = applyMove(board, "f", "todo", 0);
    expect(dense(next, "todo")).toEqual([
      "f@0",
      "a@1",
      "b@2",
      "c@3",
      "d@4",
      "e@5",
    ]);
    const updates = computeMove(board, "f", "todo", 0);
    // every row's position changed -> all 6 emitted
    expect(updates).toHaveLength(6);
    expect(updates.find((u) => u.id === "f")?.position).toBe(0);
    expect(updates.find((u) => u.id === "a")?.position).toBe(1);
  });

  it("move down (position 0 -> 5): tasks 1..5 each -1, moved gets 5", () => {
    const board = makeBoard({ todo: ["a", "b", "c", "d", "e", "f"] });
    expect(dense(applyMove(board, "a", "todo", 5), "todo")).toEqual([
      "b@0",
      "c@1",
      "d@2",
      "e@3",
      "f@4",
      "a@5",
    ]);
    expect(computeMove(board, "a", "todo", 5).find((u) => u.id === "a")?.position).toBe(5);
  });

  it("no-op: same column, same index -> empty array", () => {
    const board = makeBoard({ todo: ["a", "b", "c"] });
    expect(computeMove(board, "b", "todo", 1)).toEqual([]);
  });

  it("minimal diff: only rows whose position changed are returned", () => {
    // move c (index 2) to index 1 in a column of 4 -> only b and c shift
    const board = makeBoard({ todo: ["a", "b", "c", "d"] });
    const updates = computeMove(board, "c", "todo", 1);
    expect(updates.map((u) => u.id).sort()).toEqual(["b", "c"]);
  });
});

describe("computeMove — cross-column", () => {
  it("source closes the gap, target shifts +1 at >= toIndex, moved gets toIndex + new status", () => {
    const board = makeBoard({
      todo: ["a", "b", "c"],
      "in-progress": ["x", "y"],
    });
    const next = applyMove(board, "b", "in-progress", 1);
    expect(dense(next, "todo")).toEqual(["a@0", "c@1"]); // gap closed
    expect(dense(next, "in-progress")).toEqual(["x@0", "b@1", "y@2"]);
    expect(next["in-progress"].find((t) => t.id === "b")?.status).toBe("in-progress");

    const updates = computeMove(board, "b", "in-progress", 1);
    const moved = updates.find((u) => u.id === "b");
    expect(moved).toEqual({ id: "b", position: 1, status: "in-progress" });
    // source: c shifts to 0; target: y shifts to 2; b added -> 3 rows
    expect(updates.map((u) => u.id).sort()).toEqual(["b", "c", "y"]);
  });

  it("into an empty column: moved gets position 0, source closes the gap", () => {
    const board = makeBoard({ todo: ["a", "b"], done: [] });
    const next = applyMove(board, "a", "done", 0);
    expect(dense(next, "todo")).toEqual(["b@0"]);
    expect(dense(next, "done")).toEqual(["a@0"]);
    expect(next.done[0]?.status).toBe("done");
  });

  it("clamp: toIndex beyond target length is treated as append", () => {
    const board = makeBoard({ todo: ["a"], "in-progress": ["x", "y"] });
    const next = applyMove(board, "a", "in-progress", 99);
    expect(dense(next, "in-progress")).toEqual(["x@0", "y@1", "a@2"]);
  });
});

describe("computeMove — errors", () => {
  it("unknown taskId throws TaskNotFoundError (both functions)", () => {
    const board = makeBoard({ todo: ["a"] });
    expect(() => applyMove(board, "missing", "todo", 0)).toThrow(TaskNotFoundError);
    expect(() => computeMove(board, "missing", "todo", 0)).toThrow(TaskNotFoundError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- compute-move`
Expected: FAIL — `Cannot find module '@/services/compute-move'`.

- [ ] **Step 3: Implement `compute-move.ts`**

`services/compute-move.ts`:
```typescript
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import type { Board, Task, TaskPositionUpdate, TaskStatus } from "@/shared/types/task";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function arrayMove(items: readonly Task[], from: number, to: number): Task[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
}

function locate(board: Board, taskId: string): { fromStatus: TaskStatus; fromIndex: number; task: Task } {
  for (const status of TASK_STATUSES) {
    const fromIndex = board[status].findIndex((t) => t.id === taskId);
    if (fromIndex !== -1) {
      const task = board[status][fromIndex];
      if (task !== undefined) {
        return { fromStatus: status, fromIndex, task };
      }
    }
  }
  throw new TaskNotFoundError(taskId);
}

// Returns a new, fully dense board with the moved task at its new spot.
export function applyMove(
  board: Board,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): Board {
  const { fromStatus, fromIndex, task } = locate(board, taskId);

  const next: Board = {
    todo: [...board.todo],
    "in-progress": [...board["in-progress"]],
    done: [...board.done],
  };

  if (toStatus === fromStatus) {
    const clamped = clamp(toIndex, 0, board[fromStatus].length - 1);
    next[fromStatus] = arrayMove(board[fromStatus], fromIndex, clamped);
  } else {
    next[fromStatus] = board[fromStatus].filter((t) => t.id !== taskId);
    const targetCol = board[toStatus];
    const clamped = clamp(toIndex, 0, targetCol.length);
    next[toStatus] = [
      ...targetCol.slice(0, clamped),
      task,
      ...targetCol.slice(clamped),
    ];
  }

  const affected: TaskStatus[] =
    toStatus === fromStatus ? [fromStatus] : [fromStatus, toStatus];
  for (const status of affected) {
    next[status] = next[status].map((t, index) => ({
      ...t,
      position: index,
      status,
    }));
  }
  return next;
}

// Minimal transaction: only rows whose position or status actually changed.
export function computeMove(
  board: Board,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): TaskPositionUpdate[] {
  const next = applyMove(board, taskId, toStatus, toIndex);
  const updates: TaskPositionUpdate[] = [];
  for (const status of TASK_STATUSES) {
    const before = board[status];
    next[status].forEach((task, index) => {
      const original = before.find((t) => t.id === task.id);
      if (!original || original.position !== index || original.status !== status) {
        updates.push({ id: task.id, position: index, status });
      }
    });
  }
  return updates;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- compute-move`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add services/compute-move.ts services/__tests__/compute-move.test.ts
git commit -m "feat: pure applyMove/computeMove ordering math + tests"
```

---

## Task 4: tasksService — ordering business logic

**Files:**
- Create: `services/tasks-service.ts`
- Test: `services/__tests__/tasks-service.test.ts`

- [ ] **Step 1: Write the failing tests**

`services/__tests__/tasks-service.test.ts`:
```typescript
import "../../shared/repositories/__tests__/db-test-setup";
import { describe, expect, it } from "vitest";
import { tasksService } from "@/services/tasks-service";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksRepository } from "@/shared/repositories/tasks-repository";
import type { TaskStatus } from "@/shared/types/task";

function positions(status: TaskStatus): number[] {
  return tasksRepository.listByStatus(status).map((t) => t.position);
}

describe("tasksService.createTask", () => {
  it("appends to the bottom of its column", () => {
    expect(tasksService.createTask({ title: "first", description: "", status: "todo", priority: "medium" }).position).toBe(0);
    expect(tasksService.createTask({ title: "second", description: "", status: "todo", priority: "medium" }).position).toBe(1);
    expect(tasksService.createTask({ title: "third", description: "", status: "todo", priority: "medium" }).position).toBe(2);
    // a different column starts fresh at 0
    expect(tasksService.createTask({ title: "d", description: "", status: "done", priority: "low" }).position).toBe(0);
  });
});

describe("tasksService.moveTask", () => {
  it("cross-column move re-reads both columns dense and correctly ordered", () => {
    const a = tasksService.createTask({ title: "a", description: "", status: "todo", priority: "medium" });
    tasksService.createTask({ title: "b", description: "", status: "todo", priority: "medium" });
    tasksService.createTask({ title: "c", description: "", status: "todo", priority: "medium" });
    tasksService.createTask({ title: "x", description: "", status: "in-progress", priority: "medium" });
    tasksService.createTask({ title: "y", description: "", status: "in-progress", priority: "medium" });

    tasksService.moveTask(a.id, "in-progress", 1); // a between x and y

    expect(positions("todo")).toEqual([0, 1]); // dense after gap close
    expect(positions("in-progress")).toEqual([0, 1, 2]);
    const inProgress = tasksRepository.listByStatus("in-progress").map((t) => t.title);
    expect(inProgress).toEqual(["x", "a", "y"]);
  });

  it("modal-style call (toIndex = target length) lands the card last", () => {
    const a = tasksService.createTask({ title: "a", description: "", status: "todo", priority: "medium" });
    tasksService.createTask({ title: "x", description: "", status: "done", priority: "medium" });
    const doneLength = tasksRepository.listByStatus("done").length;

    tasksService.moveTask(a.id, "done", doneLength);

    expect(tasksRepository.listByStatus("done").map((t) => t.title)).toEqual(["x", "a"]);
  });

  it("throws TaskNotFoundError for an unknown id", () => {
    expect(() => tasksService.moveTask("missing", "done", 0)).toThrow(TaskNotFoundError);
  });
});

describe("tasksService.deleteTask", () => {
  it("closes the gap: followers shift -1, column stays dense", () => {
    const a = tasksService.createTask({ title: "a", description: "", status: "todo", priority: "medium" });
    const b = tasksService.createTask({ title: "b", description: "", status: "todo", priority: "medium" });
    const c = tasksService.createTask({ title: "c", description: "", status: "todo", priority: "medium" });

    tasksService.deleteTask(b.id);

    const todo = tasksRepository.listByStatus("todo");
    expect(todo.map((t) => t.title)).toEqual(["a", "c"]);
    expect(todo.map((t) => t.position)).toEqual([0, 1]);
    expect(a).toBeDefined();
    expect(c).toBeDefined();
  });

  it("throws TaskNotFoundError for an unknown id", () => {
    expect(() => tasksService.deleteTask("missing")).toThrow(TaskNotFoundError);
  });
});

describe("tasksService.updateTask", () => {
  it("patches title/description/priority and bumps updatedAt", () => {
    const t = tasksService.createTask({ title: "old", description: "", status: "todo", priority: "low" });
    const updated = tasksService.updateTask(t.id, { title: "new", description: "d", priority: "high" });
    expect(updated.title).toBe("new");
    expect(updated.description).toBe("d");
    expect(updated.priority).toBe("high");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(t.updatedAt.getTime());
  });

  it("throws TaskNotFoundError for an unknown id", () => {
    expect(() => tasksService.updateTask("missing", { title: "x" })).toThrow(TaskNotFoundError);
  });
});

describe("tasksService.listBoard", () => {
  it("groups by status, each group ordered by position asc", () => {
    tasksService.createTask({ title: "t0", description: "", status: "todo", priority: "medium" });
    tasksService.createTask({ title: "t1", description: "", status: "todo", priority: "medium" });
    tasksService.createTask({ title: "p0", description: "", status: "in-progress", priority: "medium" });

    const board = tasksService.listBoard();
    expect(board.todo.map((t) => t.title)).toEqual(["t0", "t1"]);
    expect(board["in-progress"].map((t) => t.title)).toEqual(["p0"]);
    expect(board.done).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- tasks-service`
Expected: FAIL — `Cannot find module '@/services/tasks-service'`.

- [ ] **Step 3: Implement `tasks-service.ts`**

`services/tasks-service.ts`:
```typescript
import { computeMove } from "@/services/compute-move";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksRepository } from "@/shared/repositories/tasks-repository";
import type { Board, Task, TaskPositionUpdate, TaskPriority, TaskStatus } from "@/shared/types/task";

interface CreateTaskInput {
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
}

interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
}

function buildBoard(): Board {
  return {
    todo: tasksRepository.listByStatus("todo"),
    "in-progress": tasksRepository.listByStatus("in-progress"),
    done: tasksRepository.listByStatus("done"),
  };
}

export const tasksService = {
  createTask(input: CreateTaskInput): Task {
    const position = (tasksRepository.getMaxPosition(input.status) ?? -1) + 1;
    return tasksRepository.create({ ...input, position });
  },

  updateTask(id: string, patch: UpdateTaskInput): Task {
    const updated = tasksRepository.update(id, patch);
    if (!updated) {
      throw new TaskNotFoundError(id);
    }
    return updated;
  },

  moveTask(id: string, toStatus: TaskStatus, toIndex: number): void {
    const updates = computeMove(buildBoard(), id, toStatus, toIndex);
    if (updates.length > 0) {
      tasksRepository.updatePositions(updates);
    }
  },

  deleteTask(id: string): void {
    const task = tasksRepository.findById(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    tasksRepository.delete(id);
    const remaining = tasksRepository.listByStatus(task.status);
    const updates: TaskPositionUpdate[] = [];
    remaining.forEach((t, index) => {
      if (t.position !== index) {
        updates.push({ id: t.id, position: index, status: t.status });
      }
    });
    if (updates.length > 0) {
      tasksRepository.updatePositions(updates);
    }
  },

  listBoard(): Board {
    return buildBoard();
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- tasks-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/tasks-service.ts services/__tests__/tasks-service.test.ts
git commit -m "feat: tasksService ordering logic + integration tests"
```

---

## Task 5: Server Actions (controller boundary)

**Files:**
- Create: `app/actions/tasks.ts`
- Test: `app/actions/__tests__/tasks.test.ts`

Note: `app/actions/tasks.ts` is a `"use server"` module — every export must be an async function. zod schemas and the error helper stay module-private (not exported). Vitest treats `"use server"` as an inert string and calls the actions as plain async functions.

- [ ] **Step 1: Write the failing tests**

`app/actions/__tests__/tasks.test.ts`:
```typescript
import "../../../shared/repositories/__tests__/db-test-setup";
import { describe, expect, it } from "vitest";
import {
  createTaskAction,
  deleteTaskAction,
  getBoardAction,
  moveTaskAction,
} from "@/app/actions/tasks";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

function makeTask(title: string): ReturnType<typeof tasksRepository.create> {
  return tasksRepository.create({ title });
}

describe("createTaskAction", () => {
  it("happy path returns ok with defaults applied", async () => {
    const result = await createTaskAction({ title: "Buy milk" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("todo");
      expect(result.data.priority).toBe("medium");
      expect(result.data.position).toBe(0);
      expect(tasksRepository.findById(result.data.id)).toBeDefined();
    }
  });

  it("empty/whitespace title returns ok:false and creates no row", async () => {
    const result = await createTaskAction({ title: "   " });
    expect(result.ok).toBe(false);
    expect(tasksRepository.list()).toHaveLength(0);
  });
});

describe("moveTaskAction", () => {
  it("rejects invalid input (negative toIndex)", async () => {
    const t = makeTask("a");
    const result = await moveTaskAction({ id: t.id, toStatus: "done", toIndex: -1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a bad status enum", async () => {
    const t = makeTask("a");
    const result = await moveTaskAction({ id: t.id, toStatus: "nope", toIndex: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-uuid id", async () => {
    const result = await moveTaskAction({ id: "not-a-uuid", toStatus: "done", toIndex: 0 });
    expect(result.ok).toBe(false);
  });

  it("maps unknown id to ok:false (no throw)", async () => {
    const result = await moveTaskAction({
      id: "00000000-0000-0000-0000-000000000000",
      toStatus: "done",
      toIndex: 0,
    });
    expect(result.ok).toBe(false);
  });
});

describe("deleteTaskAction", () => {
  it("deletes the row and returns ok", async () => {
    const t = makeTask("doomed");
    const result = await deleteTaskAction({ id: t.id });
    expect(result.ok).toBe(true);
    expect(tasksRepository.findById(t.id)).toBeUndefined();
  });
});

describe("getBoardAction", () => {
  it("returns the grouped board", async () => {
    makeTask("a");
    const result = await getBoardAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.todo).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- actions/__tests__/tasks`
Expected: FAIL — `Cannot find module '@/app/actions/tasks'`.

- [ ] **Step 3: Implement `app/actions/tasks.ts`**

`app/actions/tasks.ts`:
```typescript
"use server";

import { z } from "zod";
import { tasksService } from "@/services/tasks-service";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { logger } from "@/shared/lib/logger";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import type { ActionResult } from "@/shared/types/action-result";
import type { Board, Task } from "@/shared/types/task";

// TASK_STATUSES / TASK_PRIORITIES are `as const` tuples, so z.enum infers the
// exact `TaskStatus` / `TaskPriority` unions (no string-widening, no casts needed).
const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).default(""),
  status: statusEnum.default("todo"),
  priority: priorityEnum.default("medium"),
});

const updateTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: priorityEnum.optional(),
});

const moveTaskSchema = z.object({
  id: z.uuid(),
  toStatus: statusEnum,
  toIndex: z.number().int().min(0),
});

const deleteTaskSchema = z.object({ id: z.uuid() });

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

function toErrorResult(error: unknown): { ok: false; error: string } {
  if (error instanceof TaskNotFoundError) {
    return { ok: false, error: error.message };
  }
  logger.error({ error }, "Unexpected task action error");
  return { ok: false, error: "Something went wrong" };
}

export async function createTaskAction(input: unknown): Promise<ActionResult<Task>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    return { ok: true, data: tasksService.createTask(parsed.data) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function updateTaskAction(input: unknown): Promise<ActionResult<Task>> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    const { id, ...patch } = parsed.data;
    return { ok: true, data: tasksService.updateTask(id, patch) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function moveTaskAction(input: unknown): Promise<ActionResult<Board>> {
  const parsed = moveTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    tasksService.moveTask(parsed.data.id, parsed.data.toStatus, parsed.data.toIndex);
    return { ok: true, data: tasksService.listBoard() };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function deleteTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    tasksService.deleteTask(parsed.data.id);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getBoardAction(): Promise<ActionResult<Board>> {
  try {
    return { ok: true, data: tasksService.listBoard() };
  } catch (error) {
    return toErrorResult(error);
  }
}
```

Note: because the constant tuples are `as const`, `z.enum(TASK_STATUSES)` infers `status` as the exact `"todo" | "in-progress" | "done"` union (and priority likewise), so `parsed.data` is directly assignable to `tasksService.createTask`'s `CreateTaskInput` — no casts, no widening.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- actions/__tests__/tasks`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite + typecheck**

Run: `npm run test`
Expected: all Phase 1 + Phase 2 unit tests pass.

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add app/actions/tasks.ts app/actions/__tests__/tasks.test.ts
git commit -m "feat: zod-validated task Server Actions + boundary tests"
```

---

## Task 6: React Query provider + layout wiring

**Files:**
- Create: `components/providers.tsx`
- Modify: `app/layout.tsx`
- Create: `app/@modal/default.tsx`

- [ ] **Step 1: Create the providers wrapper**

`components/providers.tsx`:
```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Create the empty modal slot**

`app/@modal/default.tsx`:
```typescript
export default function ModalDefault(): null {
  return null;
}
```

- [ ] **Step 3: Wire layout — Providers, @modal slot, Toaster**

Edit `app/layout.tsx`. Add the `modal` parallel-slot prop and the new imports, and wrap children. Replace the component signature and body:
```typescript
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/shared/ui/sonner";
import { cn } from "@/shared/lib/utils";

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning className={cn(/* keep existing font vars */)}>
      <body>
        <ThemeProvider>
          <Providers>
            {children}
            {modal}
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
```
Keep the existing font imports and the `cn(...)` className argument exactly as they were — only add `Providers`, `Toaster`, the `modal` prop, and the wrapping.

- [ ] **Step 4: Verify the app boots**

Run: `npm run build`
Expected: builds successfully (the `@modal` slot + `default.tsx` register; no runtime board yet).

- [ ] **Step 5: Commit**

```bash
git add components/providers.tsx app/layout.tsx app/@modal/default.tsx
git commit -m "feat: react-query provider, modal slot, sonner toaster"
```

---

## Task 7: TaskCard (pure display)

**Files:**
- Create: `components/task-card.tsx`

Pure presentational: title, priority badge, hover delete button. No dnd, no data fetching. Click handling and the delete confirm dialog are passed in by the caller (the sortable wrapper) so the card stays portable.

- [ ] **Step 1: Create the card**

`components/task-card.tsx`:
```typescript
"use client";

import type React from "react";
import { RiDeleteBinLine } from "@remixicon/react";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { Task, TaskPriority } from "@/shared/types/task";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export function TaskCard({
  task,
  onOpen,
  onDelete,
}: {
  task: Task;
  onOpen?: () => void;
  onDelete?: () => void;
}): React.JSX.Element {
  return (
    <div
      data-testid="task-card"
      className="group relative rounded-lg border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full pr-6 text-left text-sm font-medium"
      >
        {task.title}
      </button>
      <div className="mt-2">
        <Badge className={cn("text-xs", PRIORITY_CLASS[task.priority])}>
          {PRIORITY_LABEL[task.priority]}
        </Badge>
      </div>
      {onDelete ? (
        <button
          type="button"
          aria-label="Delete task"
          data-testid="card-delete"
          onClick={onDelete}
          className="absolute top-2 right-2 hidden rounded p-1 text-muted-foreground hover:bg-muted group-hover:block"
        >
          <RiDeleteBinLine className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: 0 errors. (If `@remixicon/react` lacks `RiDeleteBinLine`, substitute any existing delete/trash icon from that package — verify the export name.)

- [ ] **Step 3: Commit**

```bash
git add components/task-card.tsx
git commit -m "feat: pure TaskCard display component"
```

---

## Task 8: Board, columns, dnd-kit drag-and-drop

**Files:**
- Create: `app/_components/sortable-task-card.tsx`
- Create: `app/_components/board-column.tsx`
- Create: `app/_components/board.tsx`
- Modify: `app/page.tsx`

The board reads `['board']` via React Query, owns one `DndContext`, and produces `{taskId, toStatus, toIndex}` on drop. Optimistic move reuses `applyMove` (the same permutation the server runs). Delete confirm uses `AlertDialog`.

- [ ] **Step 1: Sortable wrapper**

`app/_components/sortable-task-card.tsx`:
```typescript
"use client";

import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "@/components/task-card";
import type { Task } from "@/shared/types/task";

export function SortableTaskCard({
  task,
  onOpen,
  onDelete,
}: {
  task: Task;
  onOpen: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onOpen={onOpen} onDelete={onDelete} />
    </div>
  );
}
```

- [ ] **Step 2: Board column (droppable + SortableContext)**

`app/_components/board-column.tsx`:
```typescript
"use client";

import type React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableTaskCard } from "@/app/_components/sortable-task-card";
import type { Task, TaskStatus } from "@/shared/types/task";

const COLUMN_TITLE: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};

export function BoardColumn({
  status,
  tasks,
  onOpen,
  onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  // Empty columns still need a drop target; the column id is the droppable id.
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl bg-muted/40 p-3">
      <h2 className="px-1 text-sm font-semibold text-muted-foreground">
        {COLUMN_TITLE[status]} ({tasks.length})
      </h2>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} data-testid={`column-${status}`} className="flex min-h-24 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpen(task.id)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
```

- [ ] **Step 3: Board (DndContext + React Query + mutations)**

`app/_components/board.tsx`:
```typescript
"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteTaskAction, getBoardAction, moveTaskAction } from "@/app/actions/tasks";
import { BoardColumn } from "@/app/_components/board-column";
import { TaskCard } from "@/components/task-card";
import { applyMove } from "@/services/compute-move";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import type { Board as BoardData, Task, TaskStatus } from "@/shared/types/task";

const BOARD_KEY = ["board"] as const;
const EMPTY_BOARD: BoardData = { todo: [], "in-progress": [], done: [] };

function findColumn(board: BoardData, id: string): TaskStatus | undefined {
  if (TASK_STATUSES.includes(id as TaskStatus)) {
    return id as TaskStatus;
  }
  return TASK_STATUSES.find((s) => board[s].some((t) => t.id === id));
}

function indexInColumn(board: BoardData, status: TaskStatus, id: string): number {
  const idx = board[status].findIndex((t) => t.id === id);
  return idx === -1 ? board[status].length : idx;
}

export function Board(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragBoard, setDragBoard] = useState<BoardData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data, isLoading } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: async (): Promise<BoardData> => {
      const result = await getBoardAction();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
  const board = data ?? EMPTY_BOARD;
  const view = dragBoard ?? board;

  const moveMutation = useMutation({
    mutationFn: async (vars: { id: string; toStatus: TaskStatus; toIndex: number }) => {
      const result = await moveTaskAction(vars);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<BoardData>(BOARD_KEY);
      if (previous) {
        queryClient.setQueryData<BoardData>(BOARD_KEY, applyMove(previous, vars.id, vars.toStatus, vars.toIndex));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BOARD_KEY, context.previous);
      }
      toast.error("Could not move the task");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<BoardData>(BOARD_KEY);
      if (previous) {
        const next: BoardData = { todo: [], "in-progress": [], done: [] };
        for (const status of TASK_STATUSES) {
          next[status] = previous[status]
            .filter((t) => t.id !== id)
            .map((t, index) => ({ ...t, position: index }));
        }
        queryClient.setQueryData<BoardData>(BOARD_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BOARD_KEY, context.previous);
      }
      toast.error("Could not delete the task");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    },
  });

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    const status = findColumn(board, id);
    const task = status ? board[status].find((t) => t.id === id) ?? null : null;
    setActiveTask(task);
    setDragBoard(board);
  }

  function handleDragOver(event: DragOverEvent): void {
    if (!dragBoard || !event.over) {
      return;
    }
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const toStatus = findColumn(dragBoard, overId);
    if (!toStatus) {
      return;
    }
    const toIndex = indexInColumn(dragBoard, toStatus, overId);
    setDragBoard(applyMove(dragBoard, activeId, toStatus, toIndex));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const current = dragBoard;
    setActiveTask(null);
    setDragBoard(null);
    if (!current) {
      return;
    }
    const activeId = String(event.active.id);
    const toStatus = findColumn(current, activeId);
    if (!toStatus) {
      return;
    }
    const toIndex = current[toStatus].findIndex((t) => t.id === activeId);
    const fromStatus = findColumn(board, activeId);
    const fromIndex = fromStatus ? board[fromStatus].findIndex((t) => t.id === activeId) : -1;
    // Skip the write if nothing actually changed.
    if (fromStatus === toStatus && fromIndex === toIndex) {
      return;
    }
    moveMutation.mutate({ id: activeId, toStatus, toIndex });
  }

  return (
    <div className="flex min-h-svh flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Devlog</h1>
        <Button onClick={() => router.push("/tasks/new")}>New task</Button>
      </header>

      {isLoading ? (
        <div className="flex gap-4">
          {TASK_STATUSES.map((s) => (
            <div key={s} className="flex-1 space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-4">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={view[status]}
                onOpen={(id) => router.push(`/tasks/${id}`)}
                onDelete={(id) => setPendingDelete(id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete"
              onClick={() => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete);
                }
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Render the board from the home page**

Replace `app/page.tsx` entirely:
```typescript
import type React from "react";
import { Board } from "@/app/_components/board";

export default function Page(): React.JSX.Element {
  return <Board />;
}
```

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (If `TASK_STATUSES.includes(id as TaskStatus)` is flagged by `noUncheckedIndexedAccess`/readonly issues, it compiles fine — `includes` on `readonly TaskStatus[]` accepts a `TaskStatus`.)

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run: `npm run dev`, open `http://localhost:3000`. Expected: three empty columns with a "New task" button. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add app/_components/sortable-task-card.tsx app/_components/board-column.tsx app/_components/board.tsx app/page.tsx
git commit -m "feat: dnd-kit kanban board with optimistic move + delete"
```

---

## Task 9: Create modal (intercepting route + standalone fallback)

**Files:**
- Create: `app/_components/task-form.tsx`
- Create: `app/@modal/(.)tasks/new/page.tsx`
- Create: `app/tasks/new/page.tsx`

- [ ] **Step 1: Create the shared form**

`app/_components/task-form.tsx`:
```typescript
"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTaskAction } from "@/app/actions/tasks";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import type { Board, TaskPriority, TaskStatus } from "@/shared/types/task";

const BOARD_KEY = ["board"] as const;
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function TaskForm(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await createTaskAction({ title, description, status, priority });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      router.back();
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
  });

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setError(null);
    if (title.trim().length === 0) {
      setError("Title is required");
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium">Title</label>
        <Input id="title" data-testid="title-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        {error ? <p data-testid="form-error" className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <Textarea id="description" data-testid="description-input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Status</span>
          <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
            <SelectTrigger data-testid="status-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Priority</span>
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger data-testid="priority-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" data-testid="create-submit" disabled={mutation.isPending}>Create</Button>
      </div>
    </form>
  );
}
```
(The `Board` import is referenced by the query key type elsewhere; if biome flags it as unused here, remove the `Board` import — it is not used in this file. Keep `TaskPriority`/`TaskStatus`.)

- [ ] **Step 2: Intercepted create modal**

`app/@modal/(.)tasks/new/page.tsx`:
```typescript
"use client";

import type React from "react";
import { useRouter } from "next/navigation";
import { TaskForm } from "@/app/_components/task-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

export default function CreateTaskModal(): React.JSX.Element {
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <TaskForm />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Standalone create page (fallback)**

`app/tasks/new/page.tsx`:
```typescript
import type React from "react";
import { TaskForm } from "@/app/_components/task-form";

export default function CreateTaskPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-xl font-semibold">New task</h1>
      <TaskForm />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck` then `npm run build`
Expected: 0 errors; builds. The `/tasks/new` route + its `(.)` intercept register.

- [ ] **Step 5: Commit**

```bash
git add app/_components/task-form.tsx "app/@modal/(.)tasks/new/page.tsx" app/tasks/new/page.tsx
git commit -m "feat: routed create-task modal with standalone fallback"
```

---

## Task 10: Task modal (autosave + delete) — intercepting route + fallback

**Files:**
- Create: `app/_components/task-modal-content.tsx`
- Create: `app/@modal/(.)tasks/[id]/page.tsx`
- Create: `app/tasks/[id]/page.tsx`

Reads its task from the `['board']` cache (no per-task query). Per-field autosave: title/description on blur, status/priority on select change. Status change calls `moveTaskAction` with `toIndex = target column length` (append).

- [ ] **Step 1: Autosave content component**

`app/_components/task-modal-content.tsx`:
```typescript
"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteTaskAction,
  getBoardAction,
  moveTaskAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import type { Board, Task, TaskPriority, TaskStatus } from "@/shared/types/task";

const BOARD_KEY = ["board"] as const;
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function findTask(board: Board | undefined, id: string): Task | undefined {
  if (!board) {
    return undefined;
  }
  for (const status of TASK_STATUSES) {
    const found = board[status].find((t) => t.id === id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function TaskModalContent({ id }: { id: string }): React.JSX.Element | null {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: board, isLoading } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: async (): Promise<Board> => {
      const result = await getBoardAction();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const task = findTask(board, id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
    }
  }, [task]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
  };

  const updateMutation = useMutation({
    mutationFn: async (patch: { title?: string; description?: string; priority?: TaskPriority }) => {
      const result = await updateTaskAction({ id, ...patch });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: async (toStatus: TaskStatus) => {
      const toIndex = board ? board[toStatus].length : 0;
      const result = await moveTaskAction({ id, toStatus, toIndex });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteTaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!task) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <Input
        data-testid="modal-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== task.title && updateMutation.mutate({ title })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="text-lg font-semibold"
      />
      <Textarea
        data-testid="modal-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== task.description && updateMutation.mutate({ description })}
        placeholder="Add a description…"
      />
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Status</span>
          <Select value={task.status} onValueChange={(v) => statusMutation.mutate(v as TaskStatus)}>
            <SelectTrigger data-testid="modal-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Priority</span>
          <Select value={task.priority} onValueChange={(v) => updateMutation.mutate({ priority: v as TaskPriority })}>
            <SelectTrigger data-testid="modal-priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="modal-delete">Delete</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction data-testid="modal-confirm-delete" onClick={() => deleteMutation.mutate()}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Intercepted task modal (full-screen)**

`app/@modal/(.)tasks/[id]/page.tsx`:
```typescript
"use client";

import type React from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { TaskModalContent } from "@/app/_components/task-modal-content";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

export default function TaskModal({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent className="h-[90vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Task</DialogTitle>
        </DialogHeader>
        <TaskModalContent id={id} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Standalone task page (fallback)**

`app/tasks/[id]/page.tsx`:
```typescript
import type React from "react";
import { TaskModalContent } from "@/app/_components/task-modal-content";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl p-6">
      <TaskModalContent id={id} />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck` then `npm run build`
Expected: 0 errors; builds. Routes `/tasks/[id]` + `(.)` intercept register.

- [ ] **Step 5: Commit**

```bash
git add app/_components/task-modal-content.tsx "app/@modal/(.)tasks/[id]/page.tsx" app/tasks/[id]/page.tsx
git commit -m "feat: full-screen task modal with per-field autosave + delete"
```

---

## Task 11: E2E setup — fresh DB, migrations, drag helper

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/global-setup.ts`
- Create: `e2e/helpers.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Ignore the e2e DB directory**

Edit `.gitignore`, add under the sqlite section:
```
# e2e database (recreated each run by global-setup)
/.e2e/
```

- [ ] **Step 2: Global setup — recreate + migrate the e2e DB**

`e2e/global-setup.ts`:
```typescript
import { existsSync, mkdirSync, rmSync } from "node:fs";

const DB_FILE = ".e2e/devlog-e2e.db";

async function globalSetup(): Promise<void> {
  mkdirSync(".e2e", { recursive: true });
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${DB_FILE}${suffix}`;
    if (existsSync(file)) {
      rmSync(file);
    }
  }
  // Must set the env before importing the db client (it reads DB_FILE_NAME at import).
  process.env["DB_FILE_NAME"] = DB_FILE;
  // Relative import (not the @/ alias) so this resolves under Playwright's loader.
  const { db } = await import("../shared/infra/db");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  migrate(db, { migrationsFolder: "./drizzle" });
}

export default globalSetup;
```

- [ ] **Step 3: Point Playwright at the e2e DB + global setup**

Replace `playwright.config.ts`:
```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env["CI"],
    env: { DB_FILE_NAME: ".e2e/devlog-e2e.db" },
  },
});
```
(`@next/env` does not override an already-set `process.env.DB_FILE_NAME`, so the dev server uses the e2e DB rather than `.env`'s `devlog.db`.)

- [ ] **Step 4: Drag + assertion helpers**

`e2e/helpers.ts`:
```typescript
import type { Page } from "@playwright/test";
import type { TaskStatus } from "@/shared/types/task";

function cardByTitle(page: Page, title: string) {
  return page.getByTestId("task-card").filter({ hasText: title }).first();
}

// dnd-kit's PointerSensor needs real intermediate pointer moves past the
// activation distance (8px) — a single dragTo() will not trigger a drag.
export async function dragCard(
  page: Page,
  cardTitle: string,
  target: { type: "card"; title: string } | { type: "column"; status: TaskStatus },
): Promise<void> {
  const source = cardByTitle(page, cardTitle);
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error(`drag source not found: ${cardTitle}`);
  }

  const targetLocator =
    target.type === "card"
      ? cardByTitle(page, target.title)
      : page.getByTestId(`column-${target.status}`);
  const targetBox = await targetLocator.boundingBox();
  if (!targetBox) {
    throw new Error("drag target not found");
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 5 }); // exceed activation distance
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.move(endX, endY + 2, { steps: 3 }); // settle over target
  await page.mouse.up();
}

export async function columnTitles(page: Page, status: TaskStatus): Promise<string[]> {
  const cards = page.getByTestId(`column-${status}`).getByTestId("task-card");
  const titles = await cards.allInnerTexts();
  // strip the priority badge text on the second line
  return titles.map((t) => t.split("\n")[0]?.trim() ?? "");
}
```

- [ ] **Step 5: Verify config compiles**

Run: `npm run typecheck`
Expected: 0 errors (helpers + global-setup compile).

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/global-setup.ts e2e/helpers.ts .gitignore
git commit -m "test: e2e DB setup + dnd drag helper"
```

---

## Task 12: E2E board — drag-and-drop + create — CORE

**Files:**
- Test: `e2e/board.spec.ts`

These are the primary drag-and-drop verifications. Each drag scenario asserts the resulting order, then reloads and re-asserts (persistence checkpoint).

- [ ] **Step 1: Write the board e2e spec**

`e2e/board.spec.ts`:
```typescript
import { expect, test } from "@playwright/test";
import { columnTitles, dragCard } from "./helpers";

// Each test seeds via the UI so it is independent of DB state ordering.
async function createTask(
  page: import("@playwright/test").Page,
  opts: { title: string; status?: "todo" | "in-progress" | "done"; priority?: "low" | "medium" | "high" },
): Promise<void> {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(opts.title);
  if (opts.status) {
    await page.getByTestId("status-select").click();
    await page.getByRole("option", { name: { todo: "Todo", "in-progress": "In Progress", done: "Done" }[opts.status] }).click();
  }
  if (opts.priority) {
    await page.getByTestId("priority-select").click();
    await page.getByRole("option", { name: { low: "Low", medium: "Medium", high: "High" }[opts.priority] }).click();
  }
  await page.getByTestId("create-submit").click();
  await expect(page.getByTestId("task-card").filter({ hasText: opts.title })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
});

test("create: new task appears at the bottom of its column and persists", async ({ page }) => {
  await createTask(page, { title: "Existing IP", status: "in-progress" });
  await createTask(page, { title: "Fresh task", status: "in-progress", priority: "high" });

  expect(await columnTitles(page, "in-progress")).toEqual(["Existing IP", "Fresh task"]);

  await page.reload();
  expect(await columnTitles(page, "in-progress")).toEqual(["Existing IP", "Fresh task"]);
});

test("create validation: empty title shows an error and adds no card", async ({ page }) => {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("create-submit").click();
  await expect(page.getByTestId("form-error")).toBeVisible();
  // dialog still open, no new card on the board behind it
  await expect(page.getByTestId("title-input")).toBeVisible();
});

test("drag cross-column: card lands at the exact index and persists", async ({ page }) => {
  await createTask(page, { title: "T-only", status: "todo" });
  await createTask(page, { title: "IP-1", status: "in-progress" });
  await createTask(page, { title: "IP-2", status: "in-progress" });

  // drop T-only onto IP-2 => lands at IP-2's index (between IP-1 and IP-2)
  await dragCard(page, "T-only", { type: "card", title: "IP-2" });

  await expect(page.getByTestId("column-in-progress").getByTestId("task-card")).toHaveCount(3);
  const order = await columnTitles(page, "in-progress");
  expect(order).toContain("T-only");
  expect(order.indexOf("T-only")).toBeLessThan(order.indexOf("IP-2"));
  expect(await columnTitles(page, "todo")).toEqual([]);

  await page.reload();
  const persisted = await columnTitles(page, "in-progress");
  expect(persisted).toContain("T-only");
  expect(persisted.indexOf("T-only")).toBeLessThan(persisted.indexOf("IP-2"));
});

test("drag in-column: bottom card moves to the top and persists", async ({ page }) => {
  await createTask(page, { title: "Top", status: "todo" });
  await createTask(page, { title: "Middle", status: "todo" });
  await createTask(page, { title: "Bottom", status: "todo" });

  await dragCard(page, "Bottom", { type: "card", title: "Top" });

  expect((await columnTitles(page, "todo"))[0]).toBe("Bottom");

  await page.reload();
  expect((await columnTitles(page, "todo"))[0]).toBe("Bottom");
});

test("drag into an empty column: card lands there and persists", async ({ page }) => {
  await createTask(page, { title: "Lonely", status: "todo" });

  await dragCard(page, "Lonely", { type: "column", status: "done" });

  expect(await columnTitles(page, "done")).toEqual(["Lonely"]);
  expect(await columnTitles(page, "todo")).toEqual([]);

  await page.reload();
  expect(await columnTitles(page, "done")).toEqual(["Lonely"]);
});
```

- [ ] **Step 2: Run the board e2e spec**

Run: `npm run test:e2e -- board`
Expected: all 5 tests PASS. If a drag test is flaky, increase the `steps` counts in `dragCard` and/or add `await page.waitForTimeout(50)` after `mouse.up()` before asserting — but first confirm the move logic works by watching `--headed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/board.spec.ts
git commit -m "test: e2e board create + drag-and-drop scenarios"
```

---

## Task 13: E2E task modal

**Files:**
- Test: `e2e/task-modal.spec.ts`

- [ ] **Step 1: Write the task-modal e2e spec**

`e2e/task-modal.spec.ts`:
```typescript
import { expect, test } from "@playwright/test";
import { columnTitles } from "./helpers";

async function createTask(
  page: import("@playwright/test").Page,
  title: string,
  status: "todo" | "in-progress" | "done" = "todo",
): Promise<void> {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(title);
  if (status !== "todo") {
    await page.getByTestId("status-select").click();
    await page.getByRole("option", { name: status === "in-progress" ? "In Progress" : "Done" }).click();
  }
  await page.getByTestId("create-submit").click();
  await expect(page.getByTestId("task-card").filter({ hasText: title })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
});

test("open card -> modal at /tasks/<id>; Esc returns to the board", async ({ page }) => {
  await createTask(page, "Openable");
  await page.getByTestId("task-card").filter({ hasText: "Openable" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
});

test("autosave: title, description, priority persist after reload", async ({ page }) => {
  await createTask(page, "Editable");
  await page.getByTestId("task-card").filter({ hasText: "Editable" }).getByRole("button").first().click();

  await page.getByTestId("modal-title").fill("Edited title");
  await page.getByTestId("modal-title").blur();
  await page.getByTestId("modal-description").fill("Edited description");
  await page.getByTestId("modal-description").blur();
  await page.getByTestId("modal-priority").click();
  await page.getByRole("option", { name: "High" }).click();

  await page.goto("/");
  await expect(page.getByTestId("task-card").filter({ hasText: "Edited title" })).toBeVisible();
});

test("status via modal: card moves to the end of the new column", async ({ page }) => {
  await createTask(page, "Mover");
  await page.getByTestId("task-card").filter({ hasText: "Mover" }).getByRole("button").first().click();

  await page.getByTestId("modal-status").click();
  await page.getByRole("option", { name: "Done" }).click();

  await page.goto("/");
  expect(await columnTitles(page, "done")).toContain("Mover");
  expect(await columnTitles(page, "todo")).not.toContain("Mover");
});

test("delete from modal: confirm -> modal closes, card gone after reload", async ({ page }) => {
  await createTask(page, "Deletable");
  await page.getByTestId("task-card").filter({ hasText: "Deletable" }).getByRole("button").first().click();

  await page.getByTestId("modal-delete").click();
  await page.getByTestId("modal-confirm-delete").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("task-card").filter({ hasText: "Deletable" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("task-card").filter({ hasText: "Deletable" })).toHaveCount(0);
});

test("delete from card: hover delete -> confirm -> card gone", async ({ page }) => {
  await createTask(page, "CardDel");
  const card = page.getByTestId("task-card").filter({ hasText: "CardDel" });
  await card.hover();
  await card.getByTestId("card-delete").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByTestId("task-card").filter({ hasText: "CardDel" })).toHaveCount(0);
});

test("direct link renders the standalone task page; unknown id 404s", async ({ page }) => {
  await createTask(page, "Direct");
  // grab the id from the card's open URL
  await page.getByTestId("task-card").filter({ hasText: "Direct" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  const url = page.url();
  await page.goto(url); // standalone (non-intercepted) render
  await expect(page.getByTestId("modal-title")).toHaveValue("Direct");

  const response = await page.goto("/tasks/00000000-0000-0000-0000-000000000000");
  // notFound() renders the 404 boundary
  await expect(page.locator("body")).toContainText(/not found|404/i);
  expect(response?.status() ?? 200).toBeGreaterThanOrEqual(200);
});
```

Note: the card's open trigger is the title `<button>` (the first `button` inside the card that isn't the hover-delete). `getByRole("button").first()` targets the title button (delete is `hidden` until hover, and is later in DOM). If selector ambiguity arises, switch the open click to `card.getByText(title)`.

- [ ] **Step 2: Run the task-modal e2e spec**

Run: `npm run test:e2e -- task-modal`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/task-modal.spec.ts
git commit -m "test: e2e task modal open/autosave/status/delete/direct-link"
```

---

## Task 14: Run the full verification plan

Execute every check from the spec's Testing & Verification section. Fix any failure before declaring the plan complete.

- [ ] **Step 1: Static checks**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes (Biome + banned-directive guard). Fix any formatting with `npm run format`.

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 2: Unit/integration tests (Vitest)**

Run: `npm run test`
Expected: all pass — `compute-move.test.ts`, `tasks-service.test.ts`, `app/actions/__tests__/tasks.test.ts`, plus the Phase 1 repository suites.

- [ ] **Step 3: E2E tests (Playwright)**

Run: `npm run test:e2e`
Expected: `board.spec.ts` (5) + `task-modal.spec.ts` (7) all pass. The e2e DB is recreated by `global-setup` each run.

- [ ] **Step 4: Viewport screenshots**

Start the dev server (own terminal): `npm run dev`. Create one task per column (or reuse the e2e DB by temporarily pointing dev at it), grab a task id, then run:
```bash
node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000 http://localhost:3000/tasks/new http://localhost:3000/tasks/<seeded-id>
```
Read each PNG: three columns laid out, cards not overflowing, create form and task page intact at 375×812 and 1440×900. Stop the dev server.

- [ ] **Step 5: API smoke (curl) — skipped**

Per spec: Server Actions are not curl-addressable (Next encodes action ids); boundary validation is covered by the action-level Vitest cases and the e2e flows.

- [ ] **Step 6: DB checks — skipped**

Per spec: persistence is asserted through reload steps in every e2e scenario, and service/action tests assert row state directly against temp SQLite. No schema changes this phase.

- [ ] **Step 7: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "chore: phase 2 verification fixes"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** ordering invariants → Task 3; service ordering + delete gap-close + create-append + listBoard → Task 4; zod boundary + `{ok,error}` + no-throws → Task 5; React Query + dnd-kit + optimistic move → Task 8; create modal (all 4 fields) → Task 9; full-screen autosave modal + status-append + delete confirm → Task 10; intercepting routes + standalone fallbacks + direct link/404 → Tasks 9, 10, 13; e2e DB setup + drag helper → Task 11.
- **Type consistency:** `Board`, `TaskPositionUpdate` live in `shared/types/task.ts`; `ActionResult<T>` in `shared/types/action-result.ts`; `applyMove`/`computeMove` signatures identical across service, board, and modal; `TASK_STATUSES`/`TASK_PRIORITIES` are the single enum source for zod, columns, and selects.
- **Optimistic = server:** the board's `onMutate` and the server both run `applyMove`/`computeMove` over the same board, so the optimistic permutation matches the persisted one.
- **Known risk:** dnd e2e is the most fragile part. If `board.spec.ts` flakes, run `--headed`, then tune `dragCard` step counts before changing app logic.
