import { describe, expect, it } from "vitest";
import { applyMove } from "@/services/compute-move";
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

describe("applyMove — in-column", () => {
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
  });

  it("no-op: same column, same index -> unchanged dense order", () => {
    const board = makeBoard({ todo: ["a", "b", "c"] });
    expect(dense(applyMove(board, "b", "todo", 1), "todo")).toEqual([
      "a@0",
      "b@1",
      "c@2",
    ]);
  });
});

describe("applyMove — cross-column", () => {
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

describe("applyMove — errors", () => {
  it("unknown taskId throws TaskNotFoundError", () => {
    const board = makeBoard({ todo: ["a"] });
    expect(() => applyMove(board, "missing", "todo", 0)).toThrow(
      TaskNotFoundError,
    );
  });
});
