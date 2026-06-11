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
    expect(
      subtasksRepository.update("missing", { done: true }),
    ).toBeUndefined();
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
    const first = subtasksRepository.create({
      taskId,
      title: "a",
      position: 0,
    });
    const second = subtasksRepository.create({
      taskId,
      title: "b",
      position: 1,
    });
    subtasksRepository.updatePositions([
      { id: first.id, position: 1 },
      { id: second.id, position: 0 },
    ]);
    expect(subtasksRepository.listByTaskId(taskId).map((s) => s.title)).toEqual(
      ["b", "a"],
    );
  });

  it("throws when creating a subtask for a nonexistent task (FK enforced)", () => {
    expect(() =>
      subtasksRepository.create({ taskId: "nonexistent", title: "orphan" }),
    ).toThrow(/FOREIGN KEY/i);
  });
});
