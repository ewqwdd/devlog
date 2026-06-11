import "./db-test-setup";
import { describe, expect, it } from "vitest";
import { statusUpdatesRepository } from "@/shared/repositories/status-updates-repository";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

describe("cascade delete", () => {
  it("deleting a task removes its subtasks and status updates, leaving others intact", () => {
    const doomed = tasksRepository.create({ title: "doomed" });
    const survivor = tasksRepository.create({ title: "survivor" });
    subtasksRepository.create({ taskId: doomed.id, title: "doomed sub" });
    const keptSub = subtasksRepository.create({
      taskId: survivor.id,
      title: "kept sub",
    });
    statusUpdatesRepository.create({
      taskId: doomed.id,
      text: "doomed update",
    });
    statusUpdatesRepository.create({
      taskId: survivor.id,
      text: "kept update",
    });

    tasksRepository.delete(doomed.id);

    expect(subtasksRepository.listByTaskId(doomed.id)).toEqual([]);
    expect(statusUpdatesRepository.listByTaskId(doomed.id)).toEqual([]);
    expect(subtasksRepository.listByTaskId(survivor.id)).toEqual([keptSub]);
    expect(statusUpdatesRepository.listByTaskId(survivor.id)).toHaveLength(1);
  });
});
