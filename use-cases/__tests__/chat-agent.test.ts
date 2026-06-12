import "../../shared/repositories/__tests__/db-test-setup";
import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tasksService } from "@/services/tasks-service";
import { streamChat } from "@/use-cases/chat-agent";

beforeAll(() => {
  vi.stubEnv("MOCK_LLM", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function userMessage(text: string): UIMessage {
  return { id: "u1", role: "user", parts: [{ type: "text", text }] };
}

describe("streamChat — multi-step loop with the mock model", () => {
  it("create: Buy milk -> task is created and the reply links it", async () => {
    const result = await streamChat([userMessage("create: Buy milk")]);
    await result.consumeStream(); // drains the full stream: runs the tool, then step 2
    const finalText = await result.text;

    const board = tasksService.listBoard();
    const created = [
      ...board.todo,
      ...board["in-progress"],
      ...board.done,
    ].find((task) => task.title === "Buy milk");

    expect(created).toBeDefined();
    expect(finalText).toContain(`/tasks/${created?.id}`);
  });
});
