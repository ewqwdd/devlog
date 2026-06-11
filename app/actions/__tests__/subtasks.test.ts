import "../../../shared/repositories/__tests__/db-test-setup";
import { describe, expect, it } from "vitest";
import {
  createSubtaskAction,
  deleteSubtaskAction,
  getSubtasksAction,
  moveSubtaskAction,
  updateSubtaskAction,
} from "@/app/actions/subtasks";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

const UNKNOWN_UUID = "00000000-0000-0000-0000-000000000000";

function createParentTask(): string {
  return tasksRepository.create({ title: "parent" }).id;
}

describe("createSubtaskAction", () => {
  it("happy path inserts a row at the end and returns ok", async () => {
    const taskId = createParentTask();
    const result = await createSubtaskAction({ taskId, title: "Buy milk" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Buy milk");
      expect(result.data.position).toBe(0);
      expect(subtasksRepository.listByTaskId(taskId)).toHaveLength(1);
    }
  });

  it("empty/whitespace title returns ok:false and inserts no row", async () => {
    const taskId = createParentTask();
    const result = await createSubtaskAction({ taskId, title: "   " });
    expect(result.ok).toBe(false);
    expect(subtasksRepository.listByTaskId(taskId)).toHaveLength(0);
  });

  it("unknown taskId maps the FK violation to ok:false (not thrown)", async () => {
    const result = await createSubtaskAction({
      taskId: UNKNOWN_UUID,
      title: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Task not found");
    }
  });
});

describe("updateSubtaskAction", () => {
  it("returns ok:false when neither title nor done is provided", async () => {
    const taskId = createParentTask();
    const s = subtasksRepository.create({ taskId, title: "s" });
    const result = await updateSubtaskAction({ id: s.id });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Nothing to update");
    }
  });
});

describe("moveSubtaskAction", () => {
  it("rejects a negative toPosition", async () => {
    const taskId = createParentTask();
    const s = subtasksRepository.create({ taskId, title: "s" });
    const result = await moveSubtaskAction({ id: s.id, toPosition: -1 });
    expect(result.ok).toBe(false);
  });

  it("maps an unknown id to ok:false (no throw)", async () => {
    const result = await moveSubtaskAction({ id: UNKNOWN_UUID, toPosition: 0 });
    expect(result.ok).toBe(false);
  });
});

describe("deleteSubtaskAction", () => {
  it("deletes the row and returns ok", async () => {
    const taskId = createParentTask();
    const s = subtasksRepository.create({ taskId, title: "doomed" });
    const result = await deleteSubtaskAction({ id: s.id });
    expect(result.ok).toBe(true);
    expect(subtasksRepository.findById(s.id)).toBeUndefined();
  });

  it("maps an unknown id to ok:false (no throw)", async () => {
    const result = await deleteSubtaskAction({ id: UNKNOWN_UUID });
    expect(result.ok).toBe(false);
  });
});

describe("getSubtasksAction", () => {
  it("returns the list ordered by position", async () => {
    const taskId = createParentTask();
    subtasksRepository.create({ taskId, title: "first", position: 0 });
    subtasksRepository.create({ taskId, title: "second", position: 1 });
    const result = await getSubtasksAction({ taskId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((s) => s.title)).toEqual(["first", "second"]);
    }
  });
});
