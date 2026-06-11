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
    const result = await moveTaskAction({
      id: t.id,
      toStatus: "done",
      toIndex: -1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a bad status enum", async () => {
    const t = makeTask("a");
    const result = await moveTaskAction({
      id: t.id,
      toStatus: "nope",
      toIndex: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-uuid id", async () => {
    const result = await moveTaskAction({
      id: "not-a-uuid",
      toStatus: "done",
      toIndex: 0,
    });
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
