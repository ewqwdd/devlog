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
    expect(
      computeMove(board, "a", "todo", 5).find((u) => u.id === "a")?.position,
    ).toBe(5);
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
    expect(next["in-progress"].find((t) => t.id === "b")?.status).toBe(
      "in-progress",
    );

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
    expect(() => applyMove(board, "missing", "todo", 0)).toThrow(
      TaskNotFoundError,
    );
    expect(() => computeMove(board, "missing", "todo", 0)).toThrow(
      TaskNotFoundError,
    );
  });
});
