import { anthropic } from "@ai-sdk/anthropic";
import { type LanguageModel, simulateReadableStream } from "ai";

// Flat v5 usage shape (LanguageModelV2). v6 nests these under inputTokens.total —
// do not "upgrade" this object; it must match the installed ai@5 types.
const USAGE = { inputTokens: 5, outputTokens: 10, totalTokens: 15 };

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UUID_RE_GLOBAL =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

interface PromptMessage {
  readonly role: string;
  readonly content: unknown;
}

function isMessageArray(prompt: unknown): prompt is PromptMessage[] {
  return Array.isArray(prompt);
}

function lastUserText(prompt: unknown): string {
  if (!isMessageArray(prompt)) {
    return "";
  }
  const last = prompt.filter((message) => message.role === "user").at(-1);
  if (!last) {
    return "";
  }
  if (typeof last.content === "string") {
    return last.content;
  }
  if (!Array.isArray(last.content)) {
    return "";
  }
  return last.content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .join("");
}

function hasToolResult(prompt: unknown): boolean {
  return isMessageArray(prompt) && prompt.some((m) => m.role === "tool");
}

function firstUuid(prompt: unknown): string {
  return JSON.stringify(prompt).match(UUID_RE)?.[0] ?? "unknown";
}

function countUuids(prompt: unknown): number {
  return JSON.stringify(prompt).match(UUID_RE_GLOBAL)?.length ?? 0;
}

function createMockChatModel(
  MockModel: typeof import("ai/test").MockLanguageModelV2,
): LanguageModel {
  return new MockModel({
    // biome-ignore lint/nursery/useExplicitReturnType: callback argument — type is inferred from MockLanguageModelV2.doStream signature
    doStream: async ({ prompt }) => {
      const text = lastUserText(prompt).trim();
      const secondStep = hasToolResult(prompt);

      if (text.startsWith("error:")) {
        return {
          stream: simulateReadableStream({
            chunks: [{ type: "error", error: new Error("Mock stream error") }],
            initialDelayInMs: 150,
            chunkDelayInMs: 50,
          }),
        };
      }

      if (text.startsWith("create:")) {
        const title = text.slice("create:".length).trim() || "Untitled";
        if (!secondStep) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "call-create",
                  toolName: "createTask",
                  input: JSON.stringify({ title }),
                },
                { type: "finish", finishReason: "tool-calls", usage: USAGE },
              ],
              initialDelayInMs: 150,
              chunkDelayInMs: 50,
            }),
          };
        }
        const id = firstUuid(prompt);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "text-1" },
              {
                type: "text-delta",
                id: "text-1",
                delta: `<p>Created <a href="/tasks/${id}">${title}</a>.</p>`,
              },
              { type: "text-end", id: "text-1" },
              { type: "finish", finishReason: "stop", usage: USAGE },
            ],
            initialDelayInMs: 100,
            chunkDelayInMs: 50,
          }),
        };
      }

      if (text.includes("start with") || text.startsWith("prioritize:")) {
        if (!secondStep) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "call-prioritize",
                  toolName: "runPrioritization",
                  input: "{}",
                },
                { type: "finish", finishReason: "tool-calls", usage: USAGE },
              ],
              initialDelayInMs: 150,
              chunkDelayInMs: 50,
            }),
          };
        }
        const id = firstUuid(prompt);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "text-1" },
              {
                type: "text-delta",
                id: "text-1",
                delta: `<p>Start with <a href="/tasks/${id}">this task</a>.</p>`,
              },
              { type: "text-end", id: "text-1" },
              { type: "finish", finishReason: "stop", usage: USAGE },
            ],
            initialDelayInMs: 100,
            chunkDelayInMs: 50,
          }),
        };
      }

      if (!secondStep) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call",
                toolCallId: "call-list",
                toolName: "listTasks",
                input: "{}",
              },
              { type: "finish", finishReason: "tool-calls", usage: USAGE },
            ],
            initialDelayInMs: 150,
            chunkDelayInMs: 50,
          }),
        };
      }
      const count = countUuids(prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            {
              type: "text-delta",
              id: "text-1",
              delta: `<p>You have ${count} task${count === 1 ? "" : "s"} on the board.</p>`,
            },
            { type: "text-end", id: "text-1" },
            { type: "finish", finishReason: "stop", usage: USAGE },
          ],
          initialDelayInMs: 100,
          chunkDelayInMs: 50,
        }),
      };
    },
  });
}

export async function getChatModel(): Promise<LanguageModel> {
  if (process.env["MOCK_LLM"] === "1") {
    const { MockLanguageModelV2 } = await import("ai/test");
    return createMockChatModel(MockLanguageModelV2);
  }
  return anthropic(process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5");
}

// First in-progress task's id, else first todo task's id, else "".
// The board JSON is embedded in the listTasks tool result inside the prompt.
function pickRecommendedId(prompt: unknown): string {
  const json = JSON.stringify(prompt);
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const inProgress = json.match(
    new RegExp(`"id":"(${uuid})"[^}]*?"status":"in-progress"`, "i"),
  );
  if (inProgress?.[1]) {
    return inProgress[1];
  }
  const todo = json.match(
    new RegExp(`"id":"(${uuid})"[^}]*?"status":"todo"`, "i"),
  );
  return todo?.[1] ?? "";
}

function countToolMessages(prompt: unknown): number {
  return isMessageArray(prompt)
    ? prompt.filter((message) => message.role === "tool").length
    : 0;
}

function createMockPrioritizationModel(
  MockModel: typeof import("ai/test").MockLanguageModelV2,
): LanguageModel {
  return new MockModel({
    // biome-ignore lint/nursery/useExplicitReturnType: callback argument — type is inferred from MockLanguageModelV2.doGenerate signature
    doGenerate: async ({ prompt }) => {
      const toolMessages = countToolMessages(prompt);

      // Step 1: read the board.
      if (toolMessages === 0) {
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-list",
              toolName: "listTasks",
              input: "{}",
            },
          ],
          finishReason: "tool-calls",
          usage: USAGE,
          warnings: [],
        };
      }

      // Step 2: recommend by board position (first in-progress, else first todo).
      if (toolMessages === 1) {
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-recommend",
              toolName: "recommend",
              input: JSON.stringify({
                taskId: pickRecommendedId(prompt),
                reasoning: "Recommended by board position (offline mock).",
              }),
            },
          ],
          finishReason: "tool-calls",
          usage: USAGE,
          warnings: [],
        };
      }

      // Step 3+: recommend already executed — end the loop.
      return {
        content: [{ type: "text", text: "" }],
        finishReason: "stop",
        usage: USAGE,
        warnings: [],
      };
    },
  });
}

export async function getPrioritizationModel(): Promise<LanguageModel> {
  if (process.env["MOCK_LLM"] === "1") {
    const { MockLanguageModelV2 } = await import("ai/test");
    return createMockPrioritizationModel(MockLanguageModelV2);
  }
  return anthropic(process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5");
}

function createMockDecomposeModel(
  MockModel: typeof import("ai/test").MockLanguageModelV2,
): LanguageModel {
  return new MockModel({
    // biome-ignore lint/nursery/useExplicitReturnType: callback argument — type is inferred from MockLanguageModelV2.doGenerate signature
    doGenerate: async ({ prompt }) => {
      const text = lastUserText(prompt).toLowerCase();
      const object = text.includes("vague")
        ? {
            subtasks: [],
            reasoning:
              "The task is too vague to break down — add a clearer goal, scope, or acceptance criteria.",
          }
        : {
            subtasks: [
              { title: "Plan the approach" },
              { title: "Implement the core" },
              { title: "Write tests" },
            ],
            reasoning: "Split into plan, build, and verify steps.",
          };
      return {
        content: [{ type: "text", text: JSON.stringify(object) }],
        finishReason: "stop",
        usage: USAGE,
        warnings: [],
      };
    },
  });
}

export async function getDecomposeModel(): Promise<LanguageModel> {
  if (process.env["MOCK_LLM"] === "1") {
    const { MockLanguageModelV2 } = await import("ai/test");
    return createMockDecomposeModel(MockLanguageModelV2);
  }
  return anthropic(process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5");
}
