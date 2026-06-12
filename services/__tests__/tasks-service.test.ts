import "../../shared/repositories/__tests__/db-test-setup";
import { describe, expect, it } from "vitest";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksService } from "@/services/tasks-service";
import { tasksRepository } from "@/shared/repositories/tasks-repository";
import type { TaskStatus } from "@/shared/types/task";

function positions(status: TaskStatus): number[] {
  return tasksRepository.listByStatus(status).map((t) => t.position);
}

describe("tasksService.createTask", () => {
  it("appends to the bottom of its column", () => {
    expect(
      tasksService.createTask({
        title: "first",
        description: "",
        status: "todo",
        priority: "medium",
      }).position,
    ).toBe(0);
    expect(
      tasksService.createTask({
        title: "second",
        description: "",
        status: "todo",
        priority: "medium",
      }).position,
    ).toBe(1);
    expect(
      tasksService.createTask({
        title: "third",
        description: "",
        status: "todo",
        priority: "medium",
      }).position,
    ).toBe(2);
    // a different column starts fresh at 0
    expect(
      tasksService.createTask({
        title: "d",
        description: "",
        status: "done",
        priority: "low",
      }).position,
    ).toBe(0);
  });
});

describe("tasksService.moveTask", () => {
  it("cross-column move re-reads both columns dense and correctly ordered", () => {
    const a = tasksService.createTask({
      title: "a",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "b",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "c",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "x",
      description: "",
      status: "in-progress",
      priority: "medium",
    });
    tasksService.createTask({
      title: "y",
      description: "",
      status: "in-progress",
      priority: "medium",
    });

    tasksService.moveTask(a.id, "in-progress", 1); // a between x and y

    expect(positions("todo")).toEqual([0, 1]); // dense after gap close
    expect(positions("in-progress")).toEqual([0, 1, 2]);
    const inProgress = tasksRepository
      .listByStatus("in-progress")
      .map((t) => t.title);
    expect(inProgress).toEqual(["x", "a", "y"]);
  });

  it("modal-style call (toIndex = target length) lands the card last", () => {
    const a = tasksService.createTask({
      title: "a",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "x",
      description: "",
      status: "done",
      priority: "medium",
    });
    const doneLength = tasksRepository.listByStatus("done").length;

    tasksService.moveTask(a.id, "done", doneLength);

    expect(tasksRepository.listByStatus("done").map((t) => t.title)).toEqual([
      "x",
      "a",
    ]);
  });

  it("same-column reorder moves the card and keeps the column dense", () => {
    const a = tasksService.createTask({
      title: "a",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "b",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "c",
      description: "",
      status: "todo",
      priority: "medium",
    });

    tasksService.moveTask(a.id, "todo", 2); // front to back

    const todo = tasksRepository.listByStatus("todo");
    expect(todo.map((t) => t.title)).toEqual(["b", "c", "a"]);
    expect(todo.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("clamps a too-large in-column toIndex to the last slot", () => {
    const a = tasksService.createTask({
      title: "a",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "b",
      description: "",
      status: "todo",
      priority: "medium",
    });

    tasksService.moveTask(a.id, "todo", 99);

    expect(tasksRepository.listByStatus("todo").map((t) => t.title)).toEqual([
      "b",
      "a",
    ]);
  });

  it("throws TaskNotFoundError for an unknown id", () => {
    expect(() => tasksService.moveTask("missing", "done", 0)).toThrow(
      TaskNotFoundError,
    );
  });
});

describe("tasksService.deleteTask", () => {
  it("closes the gap: followers shift -1, column stays dense", () => {
    const a = tasksService.createTask({
      title: "a",
      description: "",
      status: "todo",
      priority: "medium",
    });
    const b = tasksService.createTask({
      title: "b",
      description: "",
      status: "todo",
      priority: "medium",
    });
    const c = tasksService.createTask({
      title: "c",
      description: "",
      status: "todo",
      priority: "medium",
    });

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
    const t = tasksService.createTask({
      title: "old",
      description: "",
      status: "todo",
      priority: "low",
    });
    const updated = tasksService.updateTask(t.id, {
      title: "new",
      description: "d",
      priority: "high",
    });
    expect(updated.title).toBe("new");
    expect(updated.description).toBe("d");
    expect(updated.priority).toBe("high");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      t.updatedAt.getTime(),
    );
  });

  it("throws TaskNotFoundError for an unknown id", () => {
    expect(() => tasksService.updateTask("missing", { title: "x" })).toThrow(
      TaskNotFoundError,
    );
  });
});

describe("tasksService.listBoard", () => {
  it("groups by status, each group ordered by position asc", () => {
    tasksService.createTask({
      title: "t0",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "t1",
      description: "",
      status: "todo",
      priority: "medium",
    });
    tasksService.createTask({
      title: "p0",
      description: "",
      status: "in-progress",
      priority: "medium",
    });

    const board = tasksService.listBoard();
    expect(board.todo.map((t) => t.title)).toEqual(["t0", "t1"]);
    expect(board["in-progress"].map((t) => t.title)).toEqual(["p0"]);
    expect(board.done).toEqual([]);
  });
});
