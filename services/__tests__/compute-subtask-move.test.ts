import { describe, expect, it } from "vitest";
import {
  applySubtaskMove,
  computeSubtaskMove,
} from "@/services/compute-subtask-move";
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

describe("applySubtaskMove / computeSubtaskMove", () => {
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
    const updates = computeSubtaskMove(subtasks, "f", 0);
    // every row's position changed -> all 6 emitted
    expect(updates).toHaveLength(6);
    expect(updates.find((u) => u.id === "f")?.position).toBe(0);
    expect(updates.find((u) => u.id === "a")?.position).toBe(1);
  });

  it("move forward (0 -> 2): mover gets 2, rows 1..2 each -1, dense afterwards", () => {
    const subtasks = makeSubtasks(["a", "b", "c", "d"]);
    expect(dense(applySubtaskMove(subtasks, "a", 2))).toEqual([
      "b@0",
      "c@1",
      "a@2",
      "d@3",
    ]);
    expect(
      computeSubtaskMove(subtasks, "a", 2).find((u) => u.id === "a")?.position,
    ).toBe(2);
  });

  it("minimal diff: only rows whose position changed are returned", () => {
    // move c (index 2) to index 1 in a list of 4 -> only b and c shift
    const subtasks = makeSubtasks(["a", "b", "c", "d"]);
    const updates = computeSubtaskMove(subtasks, "c", 1);
    expect(updates.map((u) => u.id).sort()).toEqual(["b", "c"]);
  });

  it("clamp: toPosition beyond the last index is treated as the last index", () => {
    const subtasks = makeSubtasks(["a", "b", "c"]);
    expect(applySubtaskMove(subtasks, "a", 99).map((s) => s.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("no-op: moving to its own index returns an empty array", () => {
    const subtasks = makeSubtasks(["a", "b", "c"]);
    expect(computeSubtaskMove(subtasks, "b", 1)).toEqual([]);
  });

  it("unknown id throws SubtaskNotFoundError (both functions)", () => {
    const subtasks = makeSubtasks(["a"]);
    expect(() => applySubtaskMove(subtasks, "missing", 0)).toThrow(
      SubtaskNotFoundError,
    );
    expect(() => computeSubtaskMove(subtasks, "missing", 0)).toThrow(
      SubtaskNotFoundError,
    );
  });
});
