import "../../shared/repositories/__tests__/db-test-setup";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tasksService } from "@/services/tasks-service";
import { runPrioritization } from "@/use-cases/prioritization-agent";
import { NO_TASKS_MESSAGE } from "@/use-cases/prioritization-agent/system-prompt";

beforeAll(() => {
  vi.stubEnv("MOCK_LLM", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("runPrioritization — agent loop with the mock model", () => {
  it("has in-progress: recommends an in-progress task", async () => {
    const inProgress = tasksService.createTask({
      title: "Resume me",
      description: "",
      status: "in-progress",
      priority: "medium",
    });
    tasksService.createTask({
      title: "A high todo",
      description: "",
      status: "todo",
      priority: "high",
    });

    const result = await runPrioritization();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.task?.id).toBe(inProgress.id);
      expect(result.data.task?.status).toBe("in-progress");
      expect(result.data.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("only todo: recommends a todo task", async () => {
    const todo = tasksService.createTask({
      title: "Only todo",
      description: "",
      status: "todo",
      priority: "medium",
    });

    const result = await runPrioritization();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.task?.id).toBe(todo.id);
    }
  });

  it("all done / empty pool: returns task=null and the no-tasks message", async () => {
    tasksService.createTask({
      title: "Shipped",
      description: "",
      status: "done",
      priority: "low",
    });

    const result = await runPrioritization();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.task).toBeNull();
      expect(result.data.reasoning).toBe(NO_TASKS_MESSAGE);
    }
  });
});
