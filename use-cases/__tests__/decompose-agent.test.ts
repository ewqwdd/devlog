import "../../shared/repositories/__tests__/db-test-setup";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tasksService } from "@/services/tasks-service";
import { decomposeTask } from "@/use-cases/decompose-agent";

beforeAll(() => {
  vi.stubEnv("MOCK_LLM", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("decomposeTask — single structured call with the mock model", () => {
  it("clear task: returns at least one subtask and a non-empty reasoning", async () => {
    const task = tasksService.createTask({
      title: "Build the CSV export feature",
      description: "Let users download their tasks as a CSV file.",
      status: "todo",
      priority: "medium",
    });

    const result = await decomposeTask(task.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subtasks.length).toBeGreaterThanOrEqual(1);
      expect(result.data.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("vague task: returns an empty subtask list and a non-empty reasoning", async () => {
    const task = tasksService.createTask({
      title: "vague",
      description: "",
      status: "todo",
      priority: "low",
    });

    const result = await decomposeTask(task.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subtasks).toHaveLength(0);
      expect(result.data.reasoning.length).toBeGreaterThan(0);
    }
  });
});
