import "../../shared/repositories/__tests__/db-test-setup";
import { describe, expect, it } from "vitest";
import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { subtasksService } from "@/services/subtasks-service";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

function createParentTask(): string {
  return tasksRepository.create({ title: "parent" }).id;
}
function positions(taskId: string): number[] {
  return subtasksRepository.listByTaskId(taskId).map((s) => s.position);
}
function titles(taskId: string): string[] {
  return subtasksRepository.listByTaskId(taskId).map((s) => s.title);
}

describe("subtasksService.createSubtask", () => {
  it("appends densely starting at 0", () => {
    const taskId = createParentTask();
    expect(subtasksService.createSubtask({ taskId, title: "a" }).position).toBe(
      0,
    );
    expect(subtasksService.createSubtask({ taskId, title: "b" }).position).toBe(
      1,
    );
    expect(subtasksService.createSubtask({ taskId, title: "c" }).position).toBe(
      2,
    );
    expect(positions(taskId)).toEqual([0, 1, 2]);
  });

  it("throws for an unknown taskId (FK enforced)", () => {
    expect(() =>
      subtasksService.createSubtask({ taskId: "missing", title: "x" }),
    ).toThrow();
  });
});

describe("subtasksService.updateSubtask", () => {
  it("patches title only, done only, and both; position untouched", () => {
    const taskId = createParentTask();
    const s = subtasksService.createSubtask({ taskId, title: "old" });
    expect(subtasksService.updateSubtask(s.id, { title: "new" }).title).toBe(
      "new",
    );
    expect(subtasksService.updateSubtask(s.id, { done: true }).done).toBe(true);
    const both = subtasksService.updateSubtask(s.id, {
      title: "final",
      done: false,
    });
    expect(both.title).toBe("final");
    expect(both.done).toBe(false);
    expect(both.position).toBe(0);
  });

  it("throws SubtaskNotFoundError for an unknown id", () => {
    expect(() =>
      subtasksService.updateSubtask("missing", { done: true }),
    ).toThrow(SubtaskNotFoundError);
  });
});

describe("subtasksService.moveSubtask", () => {
  it("persists the new order, dense 0..n-1", () => {
    const taskId = createParentTask();
    subtasksService.createSubtask({ taskId, title: "a" });
    subtasksService.createSubtask({ taskId, title: "b" });
    const c = subtasksService.createSubtask({ taskId, title: "c" });
    subtasksService.moveSubtask(c.id, 0);
    expect(titles(taskId)).toEqual(["c", "a", "b"]);
    expect(positions(taskId)).toEqual([0, 1, 2]);
  });

  it("moves forward and clamps a too-large position to the last slot", () => {
    const taskId = createParentTask();
    const a = subtasksService.createSubtask({ taskId, title: "a" });
    subtasksService.createSubtask({ taskId, title: "b" });
    subtasksService.createSubtask({ taskId, title: "c" });
    subtasksService.moveSubtask(a.id, 99);
    expect(titles(taskId)).toEqual(["b", "c", "a"]);
    expect(positions(taskId)).toEqual([0, 1, 2]);
  });

  it("throws SubtaskNotFoundError for an unknown id", () => {
    expect(() => subtasksService.moveSubtask("missing", 0)).toThrow(
      SubtaskNotFoundError,
    );
  });
});

describe("subtasksService.deleteSubtask", () => {
  it("decrements the tail: remaining positions 0..n-2", () => {
    const taskId = createParentTask();
    subtasksService.createSubtask({ taskId, title: "a" });
    const b = subtasksService.createSubtask({ taskId, title: "b" });
    subtasksService.createSubtask({ taskId, title: "c" });
    subtasksService.deleteSubtask(b.id);
    expect(titles(taskId)).toEqual(["a", "c"]);
    expect(positions(taskId)).toEqual([0, 1]);
  });

  it("throws SubtaskNotFoundError for an unknown id", () => {
    expect(() => subtasksService.deleteSubtask("missing")).toThrow(
      SubtaskNotFoundError,
    );
  });
});

describe("subtasksService — scoping & listing", () => {
  it("operations on one task never change another task's positions", () => {
    const taskA = createParentTask();
    const taskB = createParentTask();
    subtasksService.createSubtask({ taskId: taskA, title: "a0" });
    subtasksService.createSubtask({ taskId: taskA, title: "a1" });
    const b0 = subtasksService.createSubtask({ taskId: taskB, title: "b0" });
    subtasksService.createSubtask({ taskId: taskB, title: "b1" });
    subtasksService.moveSubtask(b0.id, 1); // reorder within B only
    expect(positions(taskA)).toEqual([0, 1]);
    expect(titles(taskA)).toEqual(["a0", "a1"]);
    expect(titles(taskB)).toEqual(["b1", "b0"]);
  });

  it("listSubtasks returns the task's subtasks ordered by position", () => {
    const taskId = createParentTask();
    subtasksService.createSubtask({ taskId, title: "first" });
    subtasksService.createSubtask({ taskId, title: "second" });
    expect(subtasksService.listSubtasks(taskId).map((s) => s.title)).toEqual([
      "first",
      "second",
    ]);
  });
});
