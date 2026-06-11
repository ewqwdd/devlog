import "./db-test-setup";
import { describe, expect, it } from "vitest";
import { statusUpdatesRepository } from "@/shared/repositories/status-updates-repository";
import { tasksRepository } from "@/shared/repositories/tasks-repository";

describe("statusUpdatesRepository", () => {
  it("create + listByTaskId round-trip", () => {
    const task = tasksRepository.create({ title: "t" });
    const update = statusUpdatesRepository.create({
      taskId: task.id,
      text: "shipped it",
    });
    expect(update.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(statusUpdatesRepository.listByTaskId(task.id)).toEqual([update]);
  });

  it("listAll returns updates newest first", () => {
    const task = tasksRepository.create({ title: "t" });
    statusUpdatesRepository.create({
      taskId: task.id,
      text: "older",
      createdAt: new Date(2026, 0, 1),
    });
    statusUpdatesRepository.create({
      taskId: task.id,
      text: "newer",
      createdAt: new Date(2026, 0, 2),
    });
    expect(statusUpdatesRepository.listAll().map((u) => u.text)).toEqual([
      "newer",
      "older",
    ]);
  });
});
