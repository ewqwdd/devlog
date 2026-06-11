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
    const a = tasksRepository.create({
      title: "a",
      status: "todo",
      position: 0,
    });
    const b = tasksRepository.create({
      title: "b",
      status: "todo",
      position: 1,
    });
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
