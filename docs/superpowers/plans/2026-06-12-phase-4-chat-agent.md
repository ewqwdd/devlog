# Phase 4 — Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI chat agent pinned to the right of the board that creates/edits/deletes tasks and subtasks via tools, answers in sanitized HTML with `/tasks/:id` links that open the task modal over the board, and refreshes the board the moment each mutating tool completes — all runnable offline via a scripted mock model.

**Architecture:** A use-case (`use-cases/chat-agent/`) orchestrates `tasksService` + `subtasksService` through nine thin zod-typed tools. The LLM provider/mock factory is infra (`shared/infra/llm.ts`). A thin `streamText` Route Handler (`app/api/chat/route.ts`) is the controller. The client (`app/_components/chat/`) owns `useChat`, renders Anthropic-style messages (flat assistant HTML, soft user bubbles, collapsible tool cards, a status line), sanitizes assistant HTML with DOMPurify, intercepts internal link clicks through `router.push`, and invalidates React Query caches per completed mutating tool.

**Tech Stack:** Next.js App Router + TypeScript strict, Vercel AI SDK **v5** (`ai@^5`, `@ai-sdk/anthropic@^2`, `@ai-sdk/react@^2`), `dompurify@^3`, Drizzle + SQLite (no schema change), zod v4, `@tanstack/react-query`, pino, Biome, Vitest (node + jsdom) + Playwright (chromium).

---

## Decisions locked in before coding

- **AI SDK is pinned to v5** (`ai@^5`, `@ai-sdk/anthropic@^2`, `@ai-sdk/react@^2`). The spec's API is written against v5: `stepCountIs`, `convertToModelMessages` (sync), `result.toUIMessageStreamResponse({ onError })`, and `MockLanguageModelV2` from `ai/test`. The current `latest` is v6, which renamed these (`isStepCount`, `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`, `MockLanguageModelV4` with a different `usage` shape). Pinning v5 keeps the spec's validated code correct. **Do not run `npm install ai@latest`** — it pulls v6 and breaks every API call below. The `^` ranges resolve to `ai@5.x`, `@ai-sdk/anthropic@2.x`, `@ai-sdk/react@2.x` (these majors are released in lockstep).
- **Model:** default `claude-haiku-4-5` (the user's explicit choice), overridable via `ANTHROPIC_MODEL`. `MOCK_LLM=1` swaps in the scripted mock. (Confirmed valid alias via the claude-api reference.)
- **`dompurify@3` ships its own types** — do **not** install `@types/dompurify` (it is a deprecated stub).
- **No reorder tools** (`moveTask`-to-index / `moveSubtask` excluded). `editTask` may change `status` by appending to the end of the target column.

## Biome / TS rules that bite here (read before writing code)

These are enforced by `npm run lint` / `npm run typecheck` and are easy to trip on this phase:

- `noExplicitAny: error` — never write `any`; use `unknown` + narrowing.
- `useExplicitReturnType: error` — **every named function and JSX event-handler arrow needs an explicit return type** (e.g. `(e): void => …`, `function f(): string`). Callbacks passed as object/array arguments (mutation `onError`, the mock's `doStream`, `.map`/`.filter` callbacks) are exempt — matching existing `app/_components/board.tsx`.
- `noFloatingPromises: error` — prefix unawaited promises with `void` (e.g. `void queryClient.invalidateQueries(...)`, `void sendMessage(...)`, `void stop()`).
- `noPropertyAccessFromIndexSignature: true` — read env vars with **bracket** access: `process.env["MOCK_LLM"]`, not `process.env.MOCK_LLM`.
- `noUncheckedIndexedAccess: true` — array index access is `T | undefined`; use `.at(-1)`, `arr[i] ?? fallback`, `match?.[0] ?? …`.
- `noTsIgnore: error` + `scripts/check-ts-directives.mjs` — no `@ts-ignore`/`@ts-nocheck`. `biome-ignore` is allowed **only with a one-line justification** (used twice below, for `dangerouslySetInnerHTML` and one `noArrayIndexKey`).
- Run `npm run format` before `npm run lint` if Biome reports import ordering (`organizeImports` is on).

---

## File Structure

| File | Responsibility | Create / Modify |
|---|---|---|
| `.env.example` | document `ANTHROPIC_MODEL` default | Modify |
| `package.json` / lockfile | add `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`, `dompurify`, dev `jsdom` | Modify |
| `shared/infra/llm.ts` | `getChatModel()` — real Anthropic provider or scripted `MockLanguageModelV2` | Create |
| `use-cases/chat-agent/tools.ts` | the 9 zod-typed tools wrapping the two services | Create |
| `use-cases/chat-agent/system-prompt.ts` | exported `SYSTEM_PROMPT` constant | Create |
| `use-cases/chat-agent/index.ts` | `streamChat(uiMessages)` — the multi-step loop | Create |
| `use-cases/__tests__/chat-agent.test.ts` | integration test (temp SQLite + mock) | Create (test) |
| `app/api/chat/route.ts` | controller: validate body → `streamChat` → UI message stream | Create |
| `app/_components/chat/sanitize-agent-html.ts` | pure DOMPurify sanitizer (XSS boundary) | Create |
| `app/_components/chat/__tests__/sanitize-agent-html.test.ts` | sanitizer unit test (jsdom) | Create (test) |
| `app/_components/chat/message-html.tsx` | render sanitized HTML + internal-link interception | Create |
| `app/_components/chat/tool-call-card.tsx` | collapsible tool-call card | Create |
| `app/_components/chat/chat-message.tsx` | render one `UIMessage` by iterating parts | Create |
| `app/_components/chat/chat-panel.tsx` | owns `useChat`, status line, board-refresh effect, input | Create |
| `app/page.tsx` | flex row: `<Board />` (flex-1) + `<ChatPanel />` | Modify |
| `playwright.config.ts` | add `MOCK_LLM: "1"` to the e2e web-server env | Modify |
| `e2e/chat.spec.ts` | 2 front-to-back e2e scenarios | Create (test) |

**Layering (CLAUDE.md):** `route (controller) → use-case → service → repository → infra`. The use-case exists because it orchestrates two services from different modules; the LLM client/mock is infra; the route holds no business logic.

---

## Task 1: Dependencies & env

**Type:** mechanical

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `.env.example`

- [ ] **Step 1: Install the runtime + dev dependencies**

The `^5` / `^2` ranges keep the AI SDK on v5 (see the decisions note above — v6 is `latest` and breaks the spec's API).

Run:
```bash
npm install ai@^5 @ai-sdk/anthropic@^2 @ai-sdk/react@^2 dompurify@^3
npm install -D jsdom
```
Expected: `package.json` gains `ai` (5.x), `@ai-sdk/anthropic` (2.x), `@ai-sdk/react` (2.x), `dompurify` (3.x) under `dependencies` and `jsdom` under `devDependencies`. **Do not add `@types/dompurify`** (dompurify v3 bundles its own types; the `@types` package is a deprecated stub).

- [ ] **Step 2: Document `ANTHROPIC_MODEL` in `.env.example`**

Replace the whole file with:

```dotenv
ANTHROPIC_API_KEY=
# Chat model used by the agent. Defaults to claude-haiku-4-5 when unset.
ANTHROPIC_MODEL=claude-haiku-4-5
# Set to 1 to use the scripted offline mock model (no API key needed).
MOCK_LLM=1
LOG_LEVEL=info
DB_FILE_NAME=devlog.db
```

- [ ] **Step 3: Verify the install typechecks**

Run: `npm run typecheck`
Expected: 0 errors (nothing imports the new packages yet; this only confirms the install didn't break resolution).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add Vercel AI SDK v5 + dompurify for the chat agent"
```

---

## Task 2: LLM infra — `getChatModel` + scripted mock

**Type:** logic

`shared/infra/llm.ts` returns the real Anthropic provider, or a deterministic `MockLanguageModelV2` (from `ai/test`) when `MOCK_LLM=1`. The mock keys on the **last user message** and exercises the full multi-step loop offline by inspecting the model prompt:

- starts with `create:` → step 1 emits a `createTask` tool call (title = the remainder); step 2 (once a tool-result is in the prompt) emits text with `<a href="/tasks/{id}">…</a>`, where `{id}` is the UUID found in the tool result.
- starts with `error:` → the stream emits an `error` part (exercises the readable-error path end-to-end).
- anything else → step 1 calls `listTasks {}`; step 2 emits text with the task count (number of UUIDs visible in the tool result).

Small stream delays make the `Thinking…`/`Using…` UI states observable to Playwright. The mock's behavior is verified end-to-end by Task 4's integration test and Task 8's e2e — there is no separate unit test here.

**Files:**
- Create: `shared/infra/llm.ts`

- [ ] **Step 1: Write the infra module**

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { type LanguageModel, simulateReadableStream } from "ai";
import { MockLanguageModelV2 } from "ai/test";

// Flat v5 usage shape (LanguageModelV2). v6 nests these under inputTokens.total —
// do not "upgrade" this object; it must match the installed ai@5 types.
const USAGE = { inputTokens: 5, outputTokens: 10, totalTokens: 15 };

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
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

function createMockChatModel(): LanguageModel {
  return new MockLanguageModelV2({
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

export function getChatModel(): LanguageModel {
  if (process.env["MOCK_LLM"] === "1") {
    return createMockChatModel();
  }
  return anthropic(process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5");
}
```

> Note: the inline `chunks` arrays are contextually typed against `LanguageModelV2StreamPart` by `MockLanguageModelV2.doStream`'s return type, so `npm run typecheck` validates the chunk shapes for you. If typecheck rejects a chunk field, the installed `ai@5` types are authoritative — adjust that field to match (do not reach for `any`). The `doStream` arrow needs no explicit return type (it is a callback argument, like the mutation `onError` callbacks in `app/_components/board.tsx`).

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes (run `npm run format` first if Biome flags import ordering).

- [ ] **Step 3: Commit**

```bash
git add shared/infra/llm.ts
git commit -m "feat: chat model factory with offline MockLanguageModelV2"
```

---

## Task 3: Tool surface — the nine chat tools

**Type:** logic

`use-cases/chat-agent/tools.ts` exports `chatTools`: nine `tool()` definitions, each a thin zod-typed wrapper over a **service** (never a repository). Every `execute` returns the project's `ActionResult` shape and **never throws** — service errors (`TaskNotFoundError`, `SubtaskNotFoundError`, FK violations) are caught and returned as `{ ok: false, error }`. Schemas mirror the existing Server Actions in `app/actions/tasks.ts` / `app/actions/subtasks.ts`.

**Files:**
- Create: `use-cases/chat-agent/tools.ts`

- [ ] **Step 1: Write the tools module**

```ts
import { tool } from "ai";
import { z } from "zod";
import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { subtasksService } from "@/services/subtasks-service";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksService } from "@/services/tasks-service";
import { logger } from "@/shared/lib/logger";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import type { ActionResult } from "@/shared/types/action-result";
import type { Subtask } from "@/shared/types/subtask";
import type { Task } from "@/shared/types/task";

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);
const titleSchema = z.string().trim().min(1, "Title is required").max(200);

function toErrorResult(error: unknown): { ok: false; error: string } {
  if (
    error instanceof TaskNotFoundError ||
    error instanceof SubtaskNotFoundError
  ) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) {
    return { ok: false, error: "Task not found" };
  }
  logger.error({ error }, "Chat tool error");
  return { ok: false, error: "Something went wrong" };
}

function findTaskById(id: string): Task | undefined {
  const board = tasksService.listBoard();
  for (const status of TASK_STATUSES) {
    const found = board[status].find((task) => task.id === id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

const listTasks = tool({
  description:
    "List tasks on the board. Optional filters (combined with AND): status, priority, and a case-insensitive search over title OR description. No filter returns the whole board.",
  inputSchema: z.object({
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    search: z.string().optional(),
  }),
  execute: async ({
    status,
    priority,
    search,
  }): Promise<ActionResult<Task[]>> => {
    try {
      const board = tasksService.listBoard();
      let tasks = TASK_STATUSES.flatMap((s) => board[s]);
      if (status) {
        tasks = tasks.filter((t) => t.status === status);
      }
      if (priority) {
        tasks = tasks.filter((t) => t.priority === priority);
      }
      if (search) {
        const query = search.toLowerCase();
        tasks = tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query),
        );
      }
      return { ok: true, data: tasks };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const createTask = tool({
  description:
    "Create a new task. It is appended to the bottom of its status column.",
  inputSchema: z.object({
    title: titleSchema,
    description: z.string().max(2000).default(""),
    status: statusEnum.default("todo"),
    priority: priorityEnum.default("medium"),
  }),
  execute: async (input): Promise<ActionResult<Task>> => {
    try {
      return { ok: true, data: tasksService.createTask(input) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const editTask = tool({
  description:
    "Edit a task. Provide its id and at least one of title, description, priority, status. Changing status moves the task to the end of the target column.",
  inputSchema: z
    .object({
      id: z.uuid(),
      title: titleSchema.optional(),
      description: z.string().max(2000).optional(),
      priority: priorityEnum.optional(),
      status: statusEnum.optional(),
    })
    .refine(
      (v) =>
        v.title !== undefined ||
        v.description !== undefined ||
        v.priority !== undefined ||
        v.status !== undefined,
      { message: "Provide at least one field to change" },
    ),
  execute: async ({
    id,
    title,
    description,
    priority,
    status,
  }): Promise<ActionResult<Task>> => {
    try {
      const patch: {
        title?: string;
        description?: string;
        priority?: (typeof TASK_PRIORITIES)[number];
      } = {};
      if (title !== undefined) {
        patch.title = title;
      }
      if (description !== undefined) {
        patch.description = description;
      }
      if (priority !== undefined) {
        patch.priority = priority;
      }
      if (Object.keys(patch).length > 0) {
        tasksService.updateTask(id, patch);
      }
      if (status !== undefined) {
        const target = tasksService.listBoard()[status];
        tasksService.moveTask(id, status, target.length);
      }
      const task = findTaskById(id);
      if (!task) {
        return { ok: false, error: `Task not found: ${id}` };
      }
      return { ok: true, data: task };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const deleteTask = tool({
  description: "Delete a task by id.",
  inputSchema: z.object({ id: z.uuid() }),
  execute: async ({ id }): Promise<ActionResult<{ id: string }>> => {
    try {
      tasksService.deleteTask(id);
      return { ok: true, data: { id } };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const listSubtasks = tool({
  description: "List a task's subtasks, ordered by position.",
  inputSchema: z.object({ taskId: z.uuid() }),
  execute: async ({ taskId }): Promise<ActionResult<Subtask[]>> => {
    try {
      return { ok: true, data: subtasksService.listSubtasks(taskId) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const createSubtask = tool({
  description: "Add a subtask to a task. It is appended at the end.",
  inputSchema: z.object({ taskId: z.uuid(), title: titleSchema }),
  execute: async ({ taskId, title }): Promise<ActionResult<Subtask>> => {
    try {
      return { ok: true, data: subtasksService.createSubtask({ taskId, title }) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const editSubtask = tool({
  description:
    "Edit a subtask. Provide its id and at least one of title or done.",
  inputSchema: z
    .object({
      id: z.uuid(),
      title: titleSchema.optional(),
      done: z.boolean().optional(),
    })
    .refine((v) => v.title !== undefined || v.done !== undefined, {
      message: "Provide a title or done state",
    }),
  execute: async ({ id, title, done }): Promise<ActionResult<Subtask>> => {
    try {
      const patch: { title?: string; done?: boolean } = {};
      if (title !== undefined) {
        patch.title = title;
      }
      if (done !== undefined) {
        patch.done = done;
      }
      return { ok: true, data: subtasksService.updateSubtask(id, patch) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const deleteSubtask = tool({
  description: "Delete a subtask by id.",
  inputSchema: z.object({ id: z.uuid() }),
  execute: async ({ id }): Promise<ActionResult<{ id: string }>> => {
    try {
      subtasksService.deleteSubtask(id);
      return { ok: true, data: { id } };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const runPrioritization = tool({
  description:
    "Reprioritize the whole board with AI. Not available yet (Phase 5).",
  inputSchema: z.object({}),
  execute: async (): Promise<ActionResult<string>> => {
    return { ok: true, data: "Prioritization is not available yet." };
  },
});

export const chatTools = {
  listTasks,
  createTask,
  editTask,
  deleteTask,
  listSubtasks,
  createSubtask,
  editSubtask,
  deleteSubtask,
  runPrioritization,
};
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes (run `npm run format` first if needed).

- [ ] **Step 3: Commit**

```bash
git add use-cases/chat-agent/tools.ts
git commit -m "feat: nine chat tools over tasks/subtasks services"
```

---

## Task 4: System prompt, `streamChat`, and the integration test

**Type:** logic

This is the **Vitest TDD target** for the agent loop. `system-prompt.ts` is a single constant; `index.ts` wires `convertToModelMessages → streamText(... stopWhen: stepCountIs(10))`. The integration test runs the loop against a temp SQLite DB + the mock model and proves, in one pass, the zod tool schema → `execute` → service → DB path, the multi-step loop, and the link format.

**Files:**
- Create: `use-cases/chat-agent/system-prompt.ts`
- Create: `use-cases/chat-agent/index.ts`
- Test: `use-cases/__tests__/chat-agent.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
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
    const result = streamChat([userMessage("create: Buy milk")]);
    await result.consumeStream(); // drains the full stream: runs the tool, then step 2
    const finalText = await result.text;

    const board = tasksService.listBoard();
    const created = [...board.todo, ...board["in-progress"], ...board.done].find(
      (task) => task.title === "Buy milk",
    );

    expect(created).toBeDefined();
    expect(finalText).toContain(`/tasks/${created?.id}`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- chat-agent`
Expected: FAIL — `@/use-cases/chat-agent` (and `streamChat`) does not exist yet.

- [ ] **Step 3: Write the system prompt**

`use-cases/chat-agent/system-prompt.ts`:

```ts
export const SYSTEM_PROMPT = `You are the task assistant inside DevLog, a personal kanban task tracker.

App model:
- Tasks have: title, description, status (todo / in-progress / done), priority (low / medium / high).
- Each task has one level of subtasks (a title and a done flag).

Your role:
- You have the same task and subtask capabilities as the user, except reordering.
- Use the provided tools for every read and write. Never invent or guess task or subtask ids — find them with listTasks (and listSubtasks) first.
- When the user asks to change something, do it with a tool; do not merely describe it.

Output format:
- Reply in HTML only. Do not use Markdown.
- The only tags you may use are exactly: p, ul, ol, li, strong, em, code, br, a.
- When you mention a task you worked with, link it as <a href="/tasks/{id}">title</a> using its real id.
- Never include external links (no http or https hrefs); only internal /tasks/{id} links.
- Keep replies short and concrete.`;
```

- [ ] **Step 4: Write `streamChat`**

`use-cases/chat-agent/index.ts`:

```ts
import {
  convertToModelMessages,
  type StreamTextResult,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getChatModel } from "@/shared/infra/llm";
import { SYSTEM_PROMPT } from "@/use-cases/chat-agent/system-prompt";
import { chatTools } from "@/use-cases/chat-agent/tools";

// 10 steps is the runaway guard for the multi-step tool loop.
export function streamChat(
  uiMessages: UIMessage[],
): StreamTextResult<typeof chatTools, never> {
  return streamText({
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    tools: chatTools,
    messages: convertToModelMessages(uiMessages),
    stopWhen: stepCountIs(10),
  });
}
```

> If `npm run typecheck` rejects the explicit return type `StreamTextResult<typeof chatTools, never>` against the installed `ai@5` generics, match the installed signature (e.g. the second type parameter may need `unknown` instead of `never`) — the installed types are authoritative. Do not drop the annotation (`useExplicitReturnType` requires it) and do not use `any`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- chat-agent`
Expected: PASS — the mock creates the task in the temp DB and the final text contains `/tasks/<that id>`.

- [ ] **Step 6: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add use-cases/chat-agent/system-prompt.ts use-cases/chat-agent/index.ts use-cases/__tests__/chat-agent.test.ts
git commit -m "feat: streamChat use-case + system prompt + loop integration test"
```

---

## Task 5: Route handler — `app/api/chat/route.ts`

**Type:** logic

Controller layer: zod-validates the body shape (`{ messages: array }`); structural validation of the UI messages is delegated to `convertToModelMessages` (inside `streamChat`), whose failure is caught and returned as 400 with the project's `{ ok: false, error }` JSON. On success it streams via `toUIMessageStreamResponse({ onError })`, where `onError` logs via pino and returns a **readable** message (the red error line the client renders — the Phase 8 checkpoint, built early). No business logic in the handler. (Behavior is covered by the Task 8 e2e — there is no curl smoke test.)

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
import type { UIMessage } from "ai";
import { z } from "zod";
import { logger } from "@/shared/lib/logger";
import { streamChat } from "@/use-cases/chat-agent";

const bodySchema = z.object({ messages: z.array(z.unknown()) });

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    const result = streamChat(parsed.data.messages as UIMessage[]);
    return result.toUIMessageStreamResponse({
      onError: (error): string => {
        logger.error({ error }, "Chat stream error");
        return "The assistant failed to respond. Try again.";
      },
    });
  } catch (error) {
    // convertToModelMessages throws here on structurally-invalid UI messages.
    logger.error({ error }, "Chat request failed");
    return Response.json(
      { ok: false, error: "The assistant failed to respond. Try again." },
      { status: 400 },
    );
  }
}
```

> Leave the runtime as the Next.js default (Node) — the tools reach `better-sqlite3` through the services, which does not run on the edge runtime. Do not add `export const runtime = "edge"`.

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: /api/chat route handler streaming the agent loop"
```

---

## Task 6: HTML sanitizer + `MessageHtml`

**Type:** logic

The XSS boundary. `sanitize-agent-html.ts` is a pure helper (so Vitest covers it directly under jsdom): `DOMPurify.sanitize` restricted to the exact allowed tags + `href`, plus an `afterSanitizeAttributes` hook that strips any `href` not starting with `/` (internal links only). `message-html.tsx` renders the sanitized HTML via `dangerouslySetInnerHTML` and intercepts internal-link clicks through `router.push` so the intercepting-route task modal opens over the board with chat state intact (the click listener is attached imperatively via a ref to avoid an a11y lint on a non-interactive element; an `<a>` activated by Enter still dispatches a `click`).

**Files:**
- Create: `app/_components/chat/sanitize-agent-html.ts`
- Test: `app/_components/chat/__tests__/sanitize-agent-html.test.ts`
- Create: `app/_components/chat/message-html.tsx`

- [ ] **Step 1: Write the failing sanitizer test**

The `// @vitest-environment jsdom` docblock must be the first line so this single file runs under jsdom (the global Vitest env is `node`). It needs the `jsdom` dev dependency from Task 1.

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeAgentHtml } from "@/app/_components/chat/sanitize-agent-html";

describe("sanitizeAgentHtml", () => {
  it("keeps allowed tags + internal links, strips scripts/handlers/external links", () => {
    const dirty = `
      <p>Hello <strong>world</strong> <em>x</em> <code>y</code></p>
      <ul><li>a</li></ul>
      <a href="/tasks/123">task</a>
      <a href="https://evil.com">bad</a>
      <a href="javascript:alert(1)">js</a>
      <script>alert('xss')</script>
      <img src=x onerror="alert(1)" />
      <button onclick="alert(1)">click</button>
    `;
    const clean = sanitizeAgentHtml(dirty);

    expect(clean).toContain("<strong>world</strong>");
    expect(clean).toContain("<li>a</li>");
    expect(clean).toContain('<a href="/tasks/123">task</a>');
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("evil.com");
    expect(clean).not.toContain("javascript:");
    // external / javascript anchors keep their text but lose the href
    expect(clean).toContain("bad");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- sanitize-agent-html`
Expected: FAIL — `sanitizeAgentHtml` is not exported yet.

- [ ] **Step 3: Write the sanitizer**

`app/_components/chat/sanitize-agent-html.ts`:

```ts
import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["p", "ul", "ol", "li", "strong", "em", "code", "br", "a"];
const ALLOWED_ATTR = ["href"];

let hookRegistered = false;

function ensureInternalLinkHook(): void {
  if (hookRegistered) {
    return;
  }
  DOMPurify.addHook("afterSanitizeAttributes", (node): void => {
    if (!(node instanceof Element)) {
      return;
    }
    const href = node.getAttribute("href");
    if (href !== null && !href.startsWith("/")) {
      node.removeAttribute("href");
    }
  });
  hookRegistered = true;
}

export function sanitizeAgentHtml(html: string): string {
  ensureInternalLinkHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- sanitize-agent-html`
Expected: PASS.

- [ ] **Step 5: Write the `MessageHtml` component**

`app/_components/chat/message-html.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef } from "react";
import { sanitizeAgentHtml } from "@/app/_components/chat/sanitize-agent-html";

export function MessageHtml({ html }: { html: string }): React.JSX.Element {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect((): (() => void) => {
    const el = ref.current;
    if (!el) {
      return (): void => {};
    }
    function handleClick(event: MouseEvent): void {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      const href = anchor?.getAttribute("href");
      if (href && href.startsWith("/")) {
        event.preventDefault();
        router.push(href);
      }
    }
    el.addEventListener("click", handleClick);
    return (): void => el.removeEventListener("click", handleClick);
  }, [router]);

  return (
    <div
      ref={ref}
      data-testid="message-html"
      className="text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized by sanitizeAgentHtml (DOMPurify) — XSS boundary covered by sanitize-agent-html.test.ts
      dangerouslySetInnerHTML={{ __html: sanitizeAgentHtml(html) }}
    />
  );
}
```

- [ ] **Step 6: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes (the single justified `biome-ignore` is allowed).

- [ ] **Step 7: Commit**

```bash
git add app/_components/chat/sanitize-agent-html.ts app/_components/chat/__tests__/sanitize-agent-html.test.ts app/_components/chat/message-html.tsx
git commit -m "feat: agent HTML sanitizer (XSS boundary) + MessageHtml renderer"
```

---

## Task 7: Chat UI — tool card, message, panel, page wiring

**Type:** logic

Three client components plus the page layout. `tool-call-card` is collapsed by default (state icon: spinner glyph while streaming, check on output, marker on error) and toggles a body with pretty-printed input/output JSON. `chat-message` renders one `UIMessage` by iterating `parts` (user text → right-aligned bubble; assistant text → `<MessageHtml>`; tool parts → `<ToolCallCard>`). `chat-panel` owns `useChat` (default transport → `/api/chat`), the auto-scrolling list, the status line, the board-refresh effect (invalidate `['board']` + `['subtasks']` once per completed mutating tool, tracked by a ref of seen `toolCallId`s), the error line, and the input (Enter sends, Shift+Enter newline, Stop while busy). `page.tsx` becomes a flex row.

**Files:**
- Create: `app/_components/chat/tool-call-card.tsx`
- Create: `app/_components/chat/chat-message.tsx`
- Create: `app/_components/chat/chat-panel.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `ToolCallCard`**

`app/_components/chat/tool-call-card.tsx`:

```tsx
"use client";

import { getToolName, type ToolUIPart } from "ai";
import type React from "react";
import { useState } from "react";

function stateIcon(state: ToolUIPart["state"]): string {
  if (state === "output-error") {
    return "✕";
  }
  if (state === "output-available") {
    return "✓";
  }
  return "…";
}

export function ToolCallCard({ part }: { part: ToolUIPart }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card text-xs" data-testid="tool-card">
      <button
        type="button"
        data-testid="tool-card-toggle"
        onClick={(): void => setExpanded((prev): boolean => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span aria-hidden="true">{stateIcon(part.state)}</span>
        <span className="font-medium">{getToolName(part)}</span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-2 border-t px-3 py-2">
          <pre className="overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(part.input ?? {}, null, 2)}
          </pre>
          {part.state === "output-available" ? (
            <pre className="overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(part.output ?? {}, null, 2)}
            </pre>
          ) : null}
          {part.state === "output-error" ? (
            <p className="text-destructive">{part.errorText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

> `part.output` and `part.errorText` exist only on specific members of the `ToolUIPart` union, so they are read **inside** an inline `part.state === …` check (which narrows `part`). `part.input` is optional across all members, hence `part.input ?? {}`.

- [ ] **Step 2: Write `ChatMessage`**

`app/_components/chat/chat-message.tsx`:

```tsx
"use client";

import { isToolUIPart, type UIMessage } from "ai";
import type React from "react";
import { MessageHtml } from "@/app/_components/chat/message-html";
import { ToolCallCard } from "@/app/_components/chat/tool-call-card";

export function ChatMessage({
  message,
}: {
  message: UIMessage;
}): React.JSX.Element {
  if (message.role === "user") {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    return (
      <div className="flex justify-end" data-testid="chat-message">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="chat-message">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: assistant message parts are append-only and have no per-part id
            <MessageHtml key={`${message.id}-${index}`} html={part.text} />
          );
        }
        if (isToolUIPart(part)) {
          return <ToolCallCard key={part.toolCallId} part={part} />;
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 3: Write `ChatPanel`**

`app/_components/chat/chat-panel.tsx`:

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/app/_components/chat/chat-message";
import { BOARD_KEY } from "@/shared/hooks/use-board-query";

const MUTATING_TOOLS = new Set([
  "createTask",
  "editTask",
  "deleteTask",
  "createSubtask",
  "editSubtask",
  "deleteSubtask",
]);

export function ChatPanel(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { messages, sendMessage, status, stop, error } = useChat();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const seenToolIds = useRef<Set<string>>(new Set());

  // Auto-scroll to the bottom on new parts.
  useEffect((): void => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Board refresh: invalidate caches once per completed mutating tool.
  useEffect((): void => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type.startsWith("tool-") &&
          "state" in part &&
          part.state === "output-available" &&
          "toolCallId" in part &&
          typeof part.toolCallId === "string" &&
          !seenToolIds.current.has(part.toolCallId)
        ) {
          const toolName = part.type.slice("tool-".length);
          if (MUTATING_TOOLS.has(toolName)) {
            seenToolIds.current.add(part.toolCallId);
            void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
            void queryClient.invalidateQueries({ queryKey: ["subtasks"] });
          }
        }
      }
    }
  }, [messages, queryClient]);

  const isBusy = status === "submitted" || status === "streaming";

  function handleSend(): void {
    const text = input.trim();
    if (!text || isBusy) {
      return;
    }
    void sendMessage({ text });
    setInput("");
  }

  let statusLine: string | null = null;
  if (status === "submitted") {
    statusLine = "Thinking…";
  } else if (status === "streaming") {
    const lastPart = messages.at(-1)?.parts.at(-1);
    if (
      lastPart &&
      lastPart.type.startsWith("tool-") &&
      "state" in lastPart &&
      lastPart.state !== "output-available" &&
      lastPart.state !== "output-error"
    ) {
      statusLine = `Using ${lastPart.type.slice("tool-".length)}…`;
    }
  }

  return (
    <aside className="hidden h-svh w-[400px] shrink-0 flex-col border-l bg-background lg:flex">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Assistant</h2>
        <p className="text-xs text-muted-foreground">
          Chat history is not saved and is lost on reload.
        </p>
      </header>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask me to create or update tasks. Try “create: Buy milk”.
          </p>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        {statusLine ? (
          <p
            data-testid="chat-status"
            className="text-xs text-muted-foreground"
          >
            {statusLine}
          </p>
        ) : null}
        {error ? (
          <p data-testid="chat-error" className="text-sm text-destructive">
            {error.message}
          </p>
        ) : null}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            data-testid="chat-input"
            value={input}
            rows={1}
            placeholder="Message the assistant…"
            onChange={(e): void => setInput(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="max-h-32 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm"
          />
          {isBusy ? (
            <button
              type="button"
              data-testid="chat-stop"
              onClick={(): void => {
                void stop();
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              data-testid="chat-send"
              onClick={(): void => handleSend()}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
```

> `useChat()` with no transport defaults to `POST /api/chat` in AI SDK v5 — that is the spec's "default transport". The board-refresh effect and status line narrow union part types with `"state" in part` / inline `part.state === …` checks (the `ToolUIPart` fields are not on text parts).

- [ ] **Step 4: Wire the page into a flex row**

Replace the whole of `app/page.tsx` with:

```tsx
import type React from "react";
import { Board } from "@/app/_components/board";
import { ChatPanel } from "@/app/_components/chat/chat-panel";

export default function Page(): React.JSX.Element {
  return (
    <div className="flex h-svh">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Board />
      </div>
      <ChatPanel />
    </div>
  );
}
```

(`<Board />` is unchanged; `min-w-0` keeps the flex child from overflowing, and the panel is `hidden lg:flex` so below 1024px the board keeps its Phase 2 behavior.)

- [ ] **Step 5: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes (the single justified `biome-ignore` for `noArrayIndexKey` is allowed; run `npm run format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add app/_components/chat/tool-call-card.tsx app/_components/chat/chat-message.tsx app/_components/chat/chat-panel.tsx app/page.tsx
git commit -m "feat: chat panel UI (messages, tool cards, status, board refresh)"
```

---

## Task 8: E2E scenarios + full verification

**Type:** logic

Two Playwright scenarios drive `/api/chat` through the real client with `MOCK_LLM=1` (reusing the Phase 2 isolated `.e2e` DB infra), then the closing steps run the spec's entire Testing & Verification section. The mock's small stream delays make the `Thinking…` / `Using…` status states reliably observable.

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/chat.spec.ts`

- [ ] **Step 1: Run the mock LLM in the e2e web server**

In `playwright.config.ts`, change the `webServer.env` object to also set `MOCK_LLM`:

```ts
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env["CI"],
    env: { DB_FILE_NAME: ".e2e/devlog-e2e.db", MOCK_LLM: "1" },
  },
```

> If a dev server is already running locally without `MOCK_LLM=1`, Playwright will reuse it (`reuseExistingServer`) and the chat would hit the real API. Stop any stray `npm run dev` before running the e2e suite so Playwright starts its own server with the mock env.

- [ ] **Step 2: Write the e2e spec**

`e2e/chat.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test";

async function waitForChatReady(page: Page): Promise<void> {
  await expect(page.getByTestId("chat-input")).toBeVisible();
}

test("create flow front-to-back: card on board without reload, link opens modal", async ({
  page,
}) => {
  await page.goto("/");
  await waitForChatReady(page);

  await page.getByTestId("chat-input").fill("create: Buy milk");
  await page.getByTestId("chat-input").press("Enter");

  // status line shows progress (Thinking… then Using createTask…)
  await expect(page.getByTestId("chat-status")).toHaveText(/Thinking|Using/);

  // the createTask tool card appears
  await expect(page.getByTestId("tool-card").first()).toBeVisible();

  // the assistant reply renders with the task link
  const link = page.getByTestId("message-html").getByRole("link").first();
  await expect(link).toBeVisible();

  // the board shows the new card WITHOUT a reload
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Buy milk" }).first(),
  ).toBeVisible();

  // clicking the task link opens the modal over the board; chat history survives
  await link.click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
  await expect(
    page
      .getByTestId("chat-message")
      .filter({ hasText: "create: Buy milk" })
      .first(),
  ).toBeVisible();
});

test("error + recovery: readable error line, then chat stays usable", async ({
  page,
}) => {
  await page.goto("/");
  await waitForChatReady(page);

  await page.getByTestId("chat-input").fill("error: boom");
  await page.getByTestId("chat-input").press("Enter");
  await expect(page.getByTestId("chat-error")).toBeVisible();

  await page.getByTestId("chat-input").fill("how many tasks?");
  await page.getByTestId("chat-input").press("Enter");
  await expect(page.getByTestId("tool-card").first()).toBeVisible();
  await expect(page.getByTestId("message-html").first()).toBeVisible();
});
```

- [ ] **Step 3: Run the chat e2e**

Run: `npm run test:e2e -- chat`
Expected: PASS (2 tests). Playwright starts its own dev server with `MOCK_LLM=1` + the isolated `.e2e` DB.

- [ ] **Step 4: Commit the e2e**

```bash
git add playwright.config.ts e2e/chat.spec.ts
git commit -m "test: e2e chat (create flow + error recovery, MOCK_LLM)"
```

- [ ] **Step 5: Full verification — static checks**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: passes (Biome + directive guard). Run `npm run format` first if it flags import ordering.

Run: `npm run build`
Expected: builds successfully (compiles the `/api/chat` route, the client chat components, and the new page layout).

- [ ] **Step 6: Full Vitest suite**

Run: `npm run test`
Expected: all suites pass, including the two new ones (`use-cases/__tests__/chat-agent.test.ts`, `app/_components/chat/__tests__/sanitize-agent-html.test.ts`) and every pre-existing suite.

- [ ] **Step 7: Full Playwright suite**

Run: `npm run test:e2e`
Expected: all e2e specs pass (board, task-modal, subtasks, smoke, and the new chat spec).

- [ ] **Step 8: Viewport screenshots**

With a dev server running using the mock (`$env:MOCK_LLM=1; npm run dev` in PowerShell), optionally send a couple of messages (incl. one that produces a tool card), then:

Run: `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000`
Expected: PNGs at 1440×900 and 375×812. Read each PNG and confirm: at 1440×900 the chat panel sits to the right of the board with no overflow and the tool card + input are reachable; at 375×812 the panel is hidden and the board renders as in Phase 2.

- [ ] **Step 9: Manual real-key check (ROADMAP checkpoint — run once)**

With `ANTHROPIC_API_KEY` set and `MOCK_LLM` off, start the app and send: "create a task to refactor auth, high priority". Confirm a high-priority "refactor auth" card appears on the board without reload. (This is the one check that exercises the real Anthropic provider; run it once before closing the phase.)

- [ ] **Step 10: Final confirmation**

All static checks, Vitest, Playwright, and screenshots green; the manual real-key check passed. Phase 4 is complete.

---

## Self-Review (performed against the spec)

**1. Spec coverage**
- §1 Tool surface (9 tools, `ActionResult`, never throws, no `getTask`/reorder, Phase-5 stub) → Task 3.
- §2 `shared/infra/llm.ts` (`getChatModel` + `MockLanguageModelV2`, three keyed branches, `.env.example` `ANTHROPIC_MODEL`) → Tasks 1 + 2.
- §2 `use-cases/chat-agent/` (`tools.ts`, `system-prompt.ts` content requirements, `index.ts` `streamChat` with `stepCountIs(10)`) → Tasks 3 + 4.
- §2 `app/api/chat/route.ts` (zod body, delegated UI-message validation → 400, `onError` readable message + pino) → Task 5.
- §3 Frontend (`chat-panel` owning `useChat` + status line + board-refresh-per-tool + error line + Enter/Shift-Enter/Stop; `chat-message` parts iteration; `tool-call-card` collapsed/expanded with testids; `message-html` DOMPurify + delegated internal-link click; `sanitize-agent-html` pure helper; page flex row, `hidden lg:flex`) → Tasks 6 + 7.
- §4 Testing & Verification (static checks; `chat-agent.test.ts`; `sanitize-agent-html.test.ts`; two e2e scenarios; screenshots; manual key check; skipped per-tool/curl/DB categories) → Tasks 4, 6, 8.

**2. Placeholder scan** — none. Every code/test step contains complete content. The two "if typecheck disagrees, the installed types are authoritative" notes are contingencies on complete code, not placeholders.

**3. Type consistency** — `getChatModel(): LanguageModel` (Task 2) is consumed by `streamChat` (Task 4); `chatTools` (Task 3) is referenced as `typeof chatTools` in `streamChat`'s return type (Task 4); `streamChat` (Task 4) is called by the route (Task 5) and the integration test (Task 4); `sanitizeAgentHtml` (Task 6) is used by `MessageHtml` (Task 6) and asserted by its test; `ToolUIPart`/`getToolName`/`isToolUIPart` used consistently across `tool-call-card` and `chat-message` (Task 7); the `MUTATING_TOOLS` names match the tool keys in `chatTools`.

**4. Verification coverage** — the only two Vitest cases in the spec appear as TDD test code (Task 4 `chat-agent.test.ts`, Task 6 `sanitize-agent-html.test.ts`); both Playwright e2e scenarios appear in Task 8; the final task runs the full verification plan (static checks, full Vitest, full Playwright, screenshots, manual key check).

**5. Task metadata** — every task carries a `Type` (Task 1 mechanical; Tasks 2–8 logic).
