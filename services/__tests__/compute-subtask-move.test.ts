import { describe, expect, it } from "vitest";
import { applySubtaskMove } from "@/services/compute-subtask-move";
import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import type { Subtask } from "@/shared/types/subtask";

// Build a dense subtask list from ordered titles (titles double as ids).
function makeSubtasks(titles: string[]): Subtask[] {
  return titles.map((title, index) => ({
    id: title,
    taskId: "t",
    title,
    position: index,
    done: false,
  }));
}

function dense(subtasks: Subtask[]): string[] {
  return subtasks.map((s) => `${s.id}@${s.position}`);
}

describe("applySubtaskMove", () => {
  it("move backward (5 -> 0): mover gets 0, former 0..4 each +1, stays dense 0..5", () => {
    const subtasks = makeSubtasks(["a", "b", "c", "d", "e", "f"]);
    expect(dense(applySubtaskMove(subtasks, "f", 0))).toEqual([
      "f@0",
      "a@1",
      "b@2",
      "c@3",
      "d@4",
      "e@5",
    ]);
  });

  it("move forward (0 -> 2): mover gets 2, rows 1..2 each -1, dense afterwards", () => {
    const subtasks = makeSubtasks(["a", "b", "c", "d"]);
    expect(dense(applySubtaskMove(subtasks, "a", 2))).toEqual([
      "b@0",
      "c@1",
      "a@2",
      "d@3",
    ]);
  });

  it("clamp: toPosition beyond the last index is treated as the last index", () => {
    const subtasks = makeSubtasks(["a", "b", "c"]);
    expect(applySubtaskMove(subtasks, "a", 99).map((s) => s.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("unknown id throws SubtaskNotFoundError", () => {
    const subtasks = makeSubtasks(["a"]);
    expect(() => applySubtaskMove(subtasks, "missing", 0)).toThrow(
      SubtaskNotFoundError,
    );
  });
});
