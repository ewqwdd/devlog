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

  it("move reorders within a column (down) keeping it dense", () => {
    const a = tasksRepository.create({
      title: "a",
      status: "todo",
      position: 0,
    });
    tasksRepository.create({ title: "b", status: "todo", position: 1 });
    tasksRepository.create({ title: "c", status: "todo", position: 2 });
    tasksRepository.move(a.id, "todo", 0, "todo", 2);
    const todo = tasksRepository.listByStatus("todo");
    expect(todo.map((t) => t.title)).toEqual(["b", "c", "a"]);
    expect(todo.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("move reorders within a column (up) keeping it dense", () => {
    tasksRepository.create({ title: "a", status: "todo", position: 0 });
    tasksRepository.create({ title: "b", status: "todo", position: 1 });
    const c = tasksRepository.create({
      title: "c",
      status: "todo",
      position: 2,
    });
    tasksRepository.move(c.id, "todo", 2, "todo", 0);
    const todo = tasksRepository.listByStatus("todo");
    expect(todo.map((t) => t.title)).toEqual(["c", "a", "b"]);
    expect(todo.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("move across statuses closes the source gap and opens the target gap", () => {
    tasksRepository.create({ title: "a", status: "todo", position: 0 });
    const b = tasksRepository.create({
      title: "b",
      status: "todo",
      position: 1,
    });
    tasksRepository.create({ title: "c", status: "todo", position: 2 });
    tasksRepository.create({ title: "x", status: "in-progress", position: 0 });
    tasksRepository.create({ title: "y", status: "in-progress", position: 1 });
    tasksRepository.move(b.id, "todo", 1, "in-progress", 1);
    const todo = tasksRepository.listByStatus("todo");
    expect(todo.map((t) => t.title)).toEqual(["a", "c"]);
    expect(todo.map((t) => t.position)).toEqual([0, 1]);
    const inProgress = tasksRepository.listByStatus("in-progress");
    expect(inProgress.map((t) => t.title)).toEqual(["x", "b", "y"]);
    expect(inProgress.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(tasksRepository.findById(b.id)?.status).toBe("in-progress");
  });

  it("closeGapAfterDelete pulls a column's followers down by one", () => {
    tasksRepository.create({ title: "a", status: "todo", position: 0 });
    const b = tasksRepository.create({
      title: "b",
      status: "todo",
      position: 1,
    });
    tasksRepository.create({ title: "c", status: "todo", position: 2 });
    tasksRepository.delete(b.id);
    tasksRepository.closeGapAfterDelete("todo", b.position);
    const todo = tasksRepository.listByStatus("todo");
    expect(todo.map((t) => t.title)).toEqual(["a", "c"]);
    expect(todo.map((t) => t.position)).toEqual([0, 1]);
  });
});
