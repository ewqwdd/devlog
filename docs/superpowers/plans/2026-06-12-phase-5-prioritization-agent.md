# Phase 5 — Prioritization Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "senior product manager" sub-agent that looks at the board and recommends the single task to start right now (`{ task, reasoning }`), reachable both from the chat agent (replacing the Phase 4 `runPrioritization` stub) and from a standalone "✨ What should I work on?" board button.

**Architecture:** A new use-case `use-cases/prioritization-agent/` runs a multi-step `generateText` tool loop (`listTasks` → `recommend`) over a strong-priors system prompt. The pool is `todo` + `in-progress`; an empty pool short-circuits without an LLM call. Two entry points reuse the one use-case: the chat tool's `execute` calls it (agent-invoking-agent), and a Server Action calls it for the standalone dialog. Offline, a scripted `MockLanguageModelV2` drives the loop deterministically by board position.

**Tech Stack:** Next.js App Router + TypeScript strict, Vercel AI SDK (`ai` v5 `generateText` + `tool` + `stepCountIs`, `@ai-sdk/anthropic`), zod v4, Drizzle + SQLite, shadcn/ui `Dialog`, TanStack Query (`useMutation`), Vitest + Playwright, Biome.

---

## Background the engineer needs (read once)

- **Layering (enforced):** `controller → use-case → service → repository → infra`. Server Actions and `route.ts` are the controller layer. The prioritization agent is orchestration (LLM infra + a service + a tool loop), so it is a **use-case**, reused by the chat tool and the Server Action. Never reach the repository from a controller/use-case — go through `tasksService`.
- **`ActionResult<T>`** (`shared/types/action-result.ts`) is the one response shape: `{ ok: true; data: T } | { ok: false; error: string }`. Actions/use-cases never throw to the client.
- **AI SDK v5 critical fact:** on a `generateText` result, `result.toolCalls` contains **only the last step's** tool calls. The recommend call may not be in the last step (the loop runs one more generation after `recommend`'s `execute` returns). **Always aggregate: `result.steps.flatMap((s) => s.toolCalls)`.** A tool call's validated input is on `.input` (v5 renamed `args` → `input`).
- **MOCK_LLM:** when `process.env["MOCK_LLM"] === "1"`, model factories return a `MockLanguageModelV2`. `generateText` drives `doGenerate`; `streamText` drives `doStream`. The chat path uses `streamText` (so the chat mock is in `doStream`); the prioritization sub-agent uses `generateText` (so its mock is in `doGenerate`). Playwright's `webServer` already sets `MOCK_LLM=1` and `DB_FILE_NAME=.e2e/devlog-e2e.db` (`playwright.config.ts:18`).
- **Tasks have:** `id`, `title`, `description`, `status` (`todo`/`in-progress`/`done`), `priority` (`low`/`medium`/`high`), `position`, `createdAt`, `updatedAt`. `tasksService.listBoard()` returns `Board = Record<TaskStatus, Task[]>`, each column ordered by `position` asc, keys in insertion order `todo, in-progress, done`.

## File Structure

**Create:**
- `shared/types/prioritization.ts` — `PrioritizationResult` (shared across use-case, chat tool, action, hook, dialog).
- `use-cases/prioritization-agent/system-prompt.ts` — `SYSTEM_PROMPT` + `NO_TASKS_MESSAGE`.
- `use-cases/prioritization-agent/tools.ts` — `listTasks` (full board) + `recommend` (terminal structured-output tool) + `recommendSchema` + `prioritizationTools`.
- `use-cases/prioritization-agent/index.ts` — `runPrioritization(): Promise<ActionResult<PrioritizationResult>>`.
- `use-cases/__tests__/prioritization-agent.test.ts` — the integration test (three board states).
- `app/actions/prioritize.ts` — `prioritizeAction()` Server Action.
- `shared/hooks/use-prioritization.ts` — `useMutation` wrapper over `prioritizeAction`.
- `app/_components/prioritization-result-dialog.tsx` — the Dialog body (loading / recommendation / no-tasks / error).
- `app/_components/prioritize-button.tsx` — top-bar button + dialog wiring.
- `e2e/prioritization.spec.ts` — three e2e scenarios.

**Modify:**
- `shared/infra/llm.ts` — add `getPrioritizationModel()` + its `doGenerate` mock + `pickRecommendedId` helper; add a prioritization branch to `createMockChatModel`.
- `services/tasks-service.ts` — add `getTask(id): Task | null`.
- `services/__tests__/tasks-service.test.ts` — add `getTask` cases.
- `use-cases/chat-agent/tools.ts` — rewire the `runPrioritization` stub to call the use-case; update its description.
- `use-cases/__tests__/chat-agent.test.ts` — add one prioritization case.
- `app/_components/board.tsx` — render `PrioritizeButton` in the header beside "New task".
- `e2e/helpers.ts` — add reusable `clearBoard` + `createTask` seed helpers.

**Type contract (define once, reuse everywhere):**
```ts
// shared/types/prioritization.ts
export interface PrioritizationResult {
  readonly task: Task | null;
  readonly reasoning: string;
}
```

---

### Task 1: Foundation — `PrioritizationResult` type + `tasksService.getTask`

**Type:** logic

**Files:**
- Create: `shared/types/prioritization.ts`
- Modify: `services/tasks-service.ts`
- Test: `services/__tests__/tasks-service.test.ts`

- [ ] **Step 1: Create the shared result type**

Create `shared/types/prioritization.ts`:

```ts
import type { Task } from "@/shared/types/task";

// The recommendation returned by the prioritization agent. `task` is null only
// when the pool (todo + in-progress) is empty; `reasoning` is always present.
export interface PrioritizationResult {
  readonly task: Task | null;
  readonly reasoning: string;
}
```

- [ ] **Step 2: Write the failing test for `getTask`**

Append to `services/__tests__/tasks-service.test.ts` (it already imports `db-test-setup`, `describe`, `expect`, `it`, and `tasksService`):

```ts
describe("tasksService.getTask", () => {
  it("returns the task when it exists", () => {
    const created = tasksService.createTask({
      title: "find me",
      description: "",
      status: "todo",
      priority: "medium",
    });
    expect(tasksService.getTask(created.id)?.id).toBe(created.id);
  });

  it("returns null for an unknown id", () => {
    expect(tasksService.getTask("missing")).toBeNull();
  });

  it("returns null for an empty id", () => {
    expect(tasksService.getTask("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- tasks-service`
Expected: FAIL — `tasksService.getTask is not a function`.

- [ ] **Step 4: Implement `getTask`**

In `services/tasks-service.ts`, add this method to the `tasksService` object (e.g. after `listBoard`). `tasksRepository.findById` returns `Task | undefined`; normalize to `null`:

```ts
  getTask(id: string): Task | null {
    return tasksRepository.findById(id) ?? null;
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- tasks-service`
Expected: PASS (all `getTask` cases green, existing cases still green).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint
git add shared/types/prioritization.ts services/tasks-service.ts services/__tests__/tasks-service.test.ts
git commit -m "feat: add PrioritizationResult type and tasksService.getTask" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Prioritization agent — prompt, tools, mock model, use-case (+ integration test)

**Type:** logic

This builds the whole offline-testable agent. The integration test (the spec's only isolated test) is the TDD driver: write it first, then add the prompt, tools, mock model, and use-case until it passes.

**Files:**
- Create: `use-cases/prioritization-agent/system-prompt.ts`
- Create: `use-cases/prioritization-agent/tools.ts`
- Create: `use-cases/prioritization-agent/index.ts`
- Modify: `shared/infra/llm.ts`
- Test: `use-cases/__tests__/prioritization-agent.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `use-cases/__tests__/prioritization-agent.test.ts`. `db-test-setup` migrates a temp SQLite db and wipes `tasks` before each test; `MOCK_LLM=1` makes the use-case use the scripted model:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- prioritization-agent`
Expected: FAIL — cannot resolve `@/use-cases/prioritization-agent`.

- [ ] **Step 3: Write the system prompt**

Create `use-cases/prioritization-agent/system-prompt.ts`:

```ts
export const NO_TASKS_MESSAGE = "There is nothing to work on right now.";

export const SYSTEM_PROMPT = `You are a senior product manager embedded in DevLog, a personal kanban task tracker. Help the developer decide the single task to start working on right now for maximum effectiveness.

App model:
- Tasks have: title, description, status (todo / in-progress / done), priority (low / medium / high), and createdAt (when it was created).
- The candidate pool is every task in todo plus every task in in-progress. Never recommend a done task.

Process:
1. Call listTasks to read the whole board.
2. Form the pool: all todo tasks plus all in-progress tasks.
3. Pick exactly one task from the pool using the judgment below.
4. Call recommend with that task's id and a concise reasoning. Use ONLY an id returned by listTasks — never invent an id. Call recommend exactly once, as your final action.

Use these priors together with common sense (no strict precedence; reconcile them):
1. Anti-thrash (WIP): prefer finishing work already in-progress over starting something new — context-switching and half-done tasks hurt the project.
2. Priority: higher priority generally comes first.
3. Aging: an old high-priority task that has been waiting (createdAt far in the past) can outweigh continuing a fresh in-progress one — but if the in-progress task is itself the older one, continue it.
4. Content / dependency (common sense): when priority and age do not decide it, read titles and descriptions — foundational / architectural / unblocking work (DB setup, auth, shared infra) comes before work that depends on it (CRUD features).

Worked examples:
- Aging beats WIP: in-progress medium "X" created today vs. todo high "Y" created 3 weeks ago -> recommend Y (high priority, rotting for weeks; the in-progress item is fresh and cheap to resume).
- WIP wins: in-progress medium "X" created 2 weeks ago vs. todo high "Y" created yesterday -> continue X (finishing the long-open item beats starting a brand-new one).
- Dependency / content: all todo, same priority, none notably older; "Set up the database schema" vs. "Build the task CRUD UI" -> recommend the database schema first (foundational; the CRUD work depends on it).
- No tasks: only done tasks or an empty board -> there is nothing to work on right now.

Your reasoning must be concise and name the signals you used (priority, age, in-progress status, dependency).`;
```

- [ ] **Step 4: Write the agent tools**

Create `use-cases/prioritization-agent/tools.ts`. `listTasks` is purpose-built for this agent (returns the **whole** board, unlike the chat agent's filtered `listTasks`); `recommend` exists only to capture the final structured answer:

```ts
import { tool } from "ai";
import { z } from "zod";
import { tasksService } from "@/services/tasks-service";
import type { Board } from "@/shared/types/task";

const listTasks = tool({
  description:
    "List the whole board: every task in todo, in-progress, and done, each with id, title, description, status, priority, and createdAt. Takes no arguments.",
  inputSchema: z.object({}),
  execute: async (): Promise<Board> => tasksService.listBoard(),
});

export const recommendSchema = z.object({
  taskId: z.string(),
  reasoning: z.string().min(1),
});

const recommend = tool({
  description:
    "Record your final recommendation: the id of the single task to start right now, plus concise reasoning. Call this exactly once, as your last action.",
  inputSchema: recommendSchema,
  execute: async (
    input: z.infer<typeof recommendSchema>,
  ): Promise<z.infer<typeof recommendSchema>> => input,
});

export const prioritizationTools = { listTasks, recommend };
```

- [ ] **Step 5: Add `getPrioritizationModel` + its `doGenerate` mock to `shared/infra/llm.ts`**

In `shared/infra/llm.ts`, add the helper and factory below. `pickRecommendedId` parses the stringified prompt to choose the first in-progress task's id (else first todo id), matching the board JSON embedded in the `listTasks` tool result (`output: { type: "json", value: <Board> }`, so task objects appear as unescaped nested JSON). Each serialized task has `"id"` before `"status"` within the same object, so `[^}]*?` stays inside one object.

Add near the other helpers (after `countUuids`):

```ts
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
```

- [ ] **Step 6: Write the use-case**

Create `use-cases/prioritization-agent/index.ts`. Note the pool short-circuit (no LLM call), and that the recommend call is found by aggregating across **all** steps (`result.toolCalls` is only the last step). Input is re-validated with `recommendSchema` so the type narrows cleanly without casts:

```ts
import { generateText, stepCountIs } from "ai";
import { tasksService } from "@/services/tasks-service";
import { getPrioritizationModel } from "@/shared/infra/llm";
import { logger } from "@/shared/lib/logger";
import type { ActionResult } from "@/shared/types/action-result";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import {
  NO_TASKS_MESSAGE,
  SYSTEM_PROMPT,
} from "@/use-cases/prioritization-agent/system-prompt";
import {
  prioritizationTools,
  recommendSchema,
} from "@/use-cases/prioritization-agent/tools";

// 6 steps is the runaway guard; a healthy run is listTasks -> recommend.
export async function runPrioritization(): Promise<
  ActionResult<PrioritizationResult>
> {
  const board = tasksService.listBoard();
  const pool = [...board.todo, ...board["in-progress"]];
  if (pool.length === 0) {
    return { ok: true, data: { task: null, reasoning: NO_TASKS_MESSAGE } };
  }

  try {
    const model = await getPrioritizationModel();
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      tools: prioritizationTools,
      prompt: "Recommend the single task to start right now.",
      stopWhen: stepCountIs(6),
    });

    const recommendCall = result.steps
      .flatMap((step) => step.toolCalls)
      .find((call) => call.toolName === "recommend");
    if (!recommendCall) {
      return {
        ok: false,
        error: "The prioritization agent did not return a recommendation.",
      };
    }

    const parsed = recommendSchema.safeParse(recommendCall.input);
    if (!parsed.success) {
      return { ok: false, error: "Could not resolve the recommended task." };
    }

    const task = parsed.data.taskId
      ? tasksService.getTask(parsed.data.taskId)
      : null;
    const inPool =
      task !== null && (task.status === "todo" || task.status === "in-progress");
    if (!inPool) {
      return { ok: false, error: "Could not resolve the recommended task." };
    }

    return { ok: true, data: { task, reasoning: parsed.data.reasoning } };
  } catch (error) {
    logger.error({ error }, "Prioritization agent failed");
    return { ok: false, error: "The prioritization agent failed. Try again." };
  }
}
```

- [ ] **Step 7: Run the integration test to verify it passes**

Run: `npm run test -- prioritization-agent`
Expected: PASS — all three cases (has in-progress, only todo, empty pool).

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint
git add use-cases/prioritization-agent shared/infra/llm.ts use-cases/__tests__/prioritization-agent.test.ts
git commit -m "feat: prioritization agent use-case with offline mock model" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Chat path — rewire the chat tool + chat mock branch

**Type:** logic

Replace the Phase 4 `runPrioritization` stub so it calls the new use-case, and add a prioritization branch to the chat `doStream` mock so the chat path runs offline. The TDD driver is one new case in the existing chat-agent test.

**Files:**
- Modify: `use-cases/chat-agent/tools.ts`
- Modify: `shared/infra/llm.ts`
- Test: `use-cases/__tests__/chat-agent.test.ts`

- [ ] **Step 1: Write the failing chat test case**

Append to `use-cases/__tests__/chat-agent.test.ts` (inside the existing `describe`, after the `create:` test). It seeds an in-progress task and asserts the assistant reply links it — exercising chat mock step 1 → `runPrioritization` tool → use-case (mock model picks the in-progress task) → chat mock step 2 link:

```ts
  it("prioritization: 'what should I start with?' -> reply links the recommended task", async () => {
    const inProgress = tasksService.createTask({
      title: "Resume me",
      description: "",
      status: "in-progress",
      priority: "medium",
    });
    tasksService.createTask({
      title: "Later",
      description: "",
      status: "todo",
      priority: "high",
    });

    const result = await streamChat([
      userMessage("what should I start with?"),
    ]);
    await result.consumeStream();
    const finalText = await result.text;

    expect(finalText).toContain(`/tasks/${inProgress.id}`);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- chat-agent`
Expected: FAIL — the reply does not contain a `/tasks/<id>` link (the stub returns plain text; the mock has no prioritization branch).

- [ ] **Step 3: Rewire the chat `runPrioritization` tool**

In `use-cases/chat-agent/tools.ts`, add the imports (alias the use-case to avoid the name clash with the tool const) and replace the stub. Add near the top imports:

```ts
import type { PrioritizationResult } from "@/shared/types/prioritization";
import { runPrioritization as runPrioritizationAgent } from "@/use-cases/prioritization-agent";
```

Replace the existing `runPrioritization` tool (currently `use-cases/chat-agent/tools.ts:237-244`) with:

```ts
const runPrioritization = tool({
  description:
    "Recommend the single best task to start working on right now, with reasoning. Returns the recommended task (or null if there is nothing to do) plus the reasoning. Takes no arguments.",
  inputSchema: z.object({}),
  execute: async (): Promise<ActionResult<PrioritizationResult>> =>
    runPrioritizationAgent(),
});
```

(Leave the `chatTools` export object unchanged — it already includes `runPrioritization`.)

- [ ] **Step 4: Add the prioritization branch to the chat mock**

In `shared/infra/llm.ts`, inside `createMockChatModel`'s `doStream`, insert this branch **before** the generic `if (!secondStep)` listTasks block (i.e. right after the `create:` block). Step 1 calls the `runPrioritization` tool `{}`; step 2 (after the tool result carries the recommended task) emits a link to its id via the existing `firstUuid(prompt)`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- chat-agent`
Expected: PASS (both the `create:` case and the prioritization case).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint
git add use-cases/chat-agent/tools.ts shared/infra/llm.ts use-cases/__tests__/chat-agent.test.ts
git commit -m "feat: rewire chat runPrioritization tool to the prioritization agent" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Standalone controller — Server Action + query hook

**Type:** mechanical

Thin controller + hook over the use-case. No new isolated test: the use-case is covered by Task 2's integration test, and the standalone path end-to-end is covered by Task 6's e2e. Correctness here is captured by typecheck.

**Files:**
- Create: `app/actions/prioritize.ts`
- Create: `shared/hooks/use-prioritization.ts`

- [ ] **Step 1: Create the Server Action**

Create `app/actions/prioritize.ts`. The action takes no input (zero-arg agent run), and the use-case already returns `ActionResult` and never throws, so this is a pure delegation at the controller boundary:

```ts
"use server";

import type { ActionResult } from "@/shared/types/action-result";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import { runPrioritization } from "@/use-cases/prioritization-agent";

export async function prioritizeAction(): Promise<
  ActionResult<PrioritizationResult>
> {
  return runPrioritization();
}
```

- [ ] **Step 2: Create the query hook**

Create `shared/hooks/use-prioritization.ts`. It mirrors the project's mutation-hook pattern (`use-create-task-mutation.ts`): throw on `!ok` so `data` is `PrioritizationResult` and `isError` covers both `ok:false` and network failures. Read-only — no cache invalidation:

```ts
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { prioritizeAction } from "@/app/actions/prioritize";
import type { PrioritizationResult } from "@/shared/types/prioritization";

export interface UsePrioritizationOptions {
  onError?: (error: Error) => void;
}

export function usePrioritization(
  options: UsePrioritizationOptions = {},
): UseMutationResult<PrioritizationResult, Error, void> {
  return useMutation({
    mutationFn: async (): Promise<PrioritizationResult> => {
      const result = await prioritizeAction();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint
git add app/actions/prioritize.ts shared/hooks/use-prioritization.ts
git commit -m "feat: prioritizeAction Server Action and usePrioritization hook" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Standalone UI — result dialog, button, board header

**Type:** logic

Component layer; the project has no component unit tests, so verification is typecheck + lint here and e2e + screenshots in Task 6/7. The button owns the mutation + open state and passes UI side effects into the dialog; the dialog is presentational over four states.

**Files:**
- Create: `app/_components/prioritization-result-dialog.tsx`
- Create: `app/_components/prioritize-button.tsx`
- Modify: `app/_components/board.tsx`

- [ ] **Step 1: Create the result dialog**

Create `app/_components/prioritization-result-dialog.tsx`. States: loading → recommendation (task link + priority icon + reasoning + "Go to task") → no-tasks (reasoning) → error (line + "Try again"). `task` and `reasoning` are captured as consts so the recommendation branch narrows `task` to `Task` without a non-null assertion:

```tsx
"use client";

import Link from "next/link";
import type React from "react";
import { PriorityIcon } from "@/components/priority-icon";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

export function PrioritizationResultDialog({
  open,
  onOpenChange,
  isPending,
  isError,
  result,
  onGoToTask,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  isError: boolean;
  result: PrioritizationResult | null;
  onGoToTask: (id: string) => void;
  onRetry: () => void;
}): React.JSX.Element {
  const task = result?.task ?? null;
  const reasoning = result?.reasoning ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="prioritization-dialog">
        <DialogHeader>
          <DialogTitle>What to work on next</DialogTitle>
          <DialogDescription>
            A recommendation from your assistant.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p
            data-testid="prioritization-loading"
            className="text-sm text-muted-foreground"
          >
            Thinking…
          </p>
        ) : isError ? (
          <div className="space-y-3">
            <p
              data-testid="prioritization-error"
              className="text-sm text-destructive"
            >
              The recommendation failed. Try again.
            </p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : task ? (
          <div
            className="space-y-3"
            data-testid="prioritization-recommendation"
          >
            <div className="flex items-center gap-2">
              <PriorityIcon priority={task.priority} />
              <Link
                href={`/tasks/${task.id}`}
                data-testid="recommended-task-link"
                className="font-medium underline underline-offset-2"
              >
                {task.title}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{reasoning}</p>
            <DialogFooter>
              <Button
                data-testid="go-to-task"
                onClick={(): void => onGoToTask(task.id)}
              >
                Go to task
              </Button>
            </DialogFooter>
          </div>
        ) : result ? (
          <p
            data-testid="prioritization-empty"
            className="text-sm text-muted-foreground"
          >
            {reasoning}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the button**

Create `app/_components/prioritize-button.tsx`. Clicking opens the dialog and fires the mutation; "Go to task" closes the dialog and navigates to the intercepting-route task modal:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { PrioritizationResultDialog } from "@/app/_components/prioritization-result-dialog";
import { usePrioritization } from "@/shared/hooks/use-prioritization";
import { Button } from "@/shared/ui/button";

export function PrioritizeButton(): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mutation = usePrioritization();

  function handleClick(): void {
    setOpen(true);
    mutation.mutate();
  }

  return (
    <>
      <Button
        variant="outline"
        data-testid="prioritize-button"
        onClick={handleClick}
      >
        ✨ What should I work on?
      </Button>
      <PrioritizationResultDialog
        open={open}
        onOpenChange={setOpen}
        isPending={mutation.isPending}
        isError={mutation.isError}
        result={mutation.data ?? null}
        onGoToTask={(id): void => {
          setOpen(false);
          router.push(`/tasks/${id}`);
        }}
        onRetry={(): void => {
          mutation.mutate();
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Wire the button into the board header**

In `app/_components/board.tsx`, add the import at the top with the other `@/app/_components` imports:

```tsx
import { PrioritizeButton } from "@/app/_components/prioritize-button";
```

Then replace the single "New task" `Button` in the header (currently `app/_components/board.tsx:154-157`) with both buttons grouped:

```tsx
        <div className="flex items-center gap-2">
          <PrioritizeButton />
          <Button onClick={(): void => router.push("/tasks/new")}>
            <RiAddLine />
            New task
          </Button>
        </div>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck` then `npm run lint`
Expected: 0 errors. (If `RiAddLine` import becomes the only remaining header import usage, leave it — it is still used.)

- [ ] **Step 5: Commit**

```bash
git add app/_components/prioritization-result-dialog.tsx app/_components/prioritize-button.tsx app/_components/board.tsx
git commit -m "feat: standalone What should I work on button and result dialog" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: E2E — seed helpers + prioritization scenarios

**Type:** logic

Add reusable seed helpers to `e2e/helpers.ts` (the spec mandates seeding via this file) and the three e2e scenarios. The dev server runs with `MOCK_LLM=1`, so the mock picks by board position; this verifies wiring, not reasoning quality.

**Files:**
- Modify: `e2e/helpers.ts`
- Test: `e2e/prioritization.spec.ts`

- [ ] **Step 1: Add seed helpers to `e2e/helpers.ts`**

`e2e/helpers.ts` currently imports `{ Locator, Page }`. Change the import to also bring in `expect`, and append the helpers. They drive the real UI (New task modal + delete flow), the same approach `e2e/board.spec.ts` uses — the shared SQLite db is reset only once per run, so each spec must clear it first:

Change line 1 to:

```ts
import { expect, type Locator, type Page } from "@playwright/test";
```

Append at the end of the file:

```ts
async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByTestId("column-todo")).toBeVisible();
  await expect(page.getByTestId("column-in-progress")).toBeVisible();
  await expect(page.getByTestId("column-done")).toBeVisible();
}

// The shared e2e db is reset once per run, so each spec must start from empty.
// Delete every card through the UI (hover -> card-delete -> confirm-delete).
export async function clearBoard(page: Page): Promise<void> {
  await waitForBoardReady(page);
  for (;;) {
    const cards = page.getByTestId("task-card");
    const count = await cards.count();
    if (count === 0) {
      return;
    }
    const first = cards.first();
    await first.hover();
    await first.getByTestId("card-delete").click();
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByTestId("task-card")).toHaveCount(count - 1);
  }
}

export async function createTask(
  page: Page,
  opts: {
    title: string;
    status?: TaskStatus;
    priority?: "low" | "medium" | "high";
  },
): Promise<void> {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(opts.title);
  if (opts.status) {
    await page.getByTestId("status-select").click();
    await page
      .getByRole("option", {
        name: { todo: "Todo", "in-progress": "In Progress", done: "Done" }[
          opts.status
        ],
      })
      .click();
  }
  if (opts.priority) {
    await page.getByTestId("priority-select").click();
    await page
      .getByRole("option", {
        name: { low: "Low", medium: "Medium", high: "High" }[opts.priority],
      })
      .click();
  }
  await page.getByTestId("create-submit").click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: opts.title }),
  ).toBeVisible();
}
```

- [ ] **Step 2: Write the e2e spec**

Create `e2e/prioritization.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test";
import { clearBoard, createTask } from "./helpers";

async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForBoardReady(page);
  await clearBoard(page);
});

test("standalone: recommend a task and navigate to it", async ({ page }) => {
  await createTask(page, { title: "Resume me", status: "in-progress" });
  await createTask(page, { title: "Start later", status: "todo", priority: "high" });

  await page.getByRole("button", { name: "What should I work on?" }).click();
  await expect(page.getByTestId("prioritization-dialog")).toBeVisible();

  const link = page.getByTestId("recommended-task-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/Resume me/);

  await page.getByTestId("go-to-task").click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
});

test("chat: 'what should I start with?' renders a tool card and a linked reply", async ({
  page,
}) => {
  await createTask(page, { title: "Resume me", status: "in-progress" });

  await page.getByTestId("chat-input").fill("what should I start with?");
  await page.getByTestId("chat-input").press("Enter");

  await expect(page.getByTestId("tool-card").first()).toBeVisible();
  const link = page.getByTestId("message-html").getByRole("link").first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/tasks\/[0-9a-f-]{36}$/);
});

test("no-tasks: empty pool shows the nothing-to-do message", async ({
  page,
}) => {
  // beforeEach cleared the board, so the pool is empty.
  await page.getByRole("button", { name: "What should I work on?" }).click();
  await expect(page.getByTestId("prioritization-dialog")).toBeVisible();
  await expect(page.getByTestId("prioritization-empty")).toBeVisible();
});
```

- [ ] **Step 3: Run the prioritization e2e spec**

Run: `npm run test:e2e -- prioritization`
Expected: PASS — all three tests. (Playwright's `webServer` starts `npm run dev` with `MOCK_LLM=1` automatically.)

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers.ts e2e/prioritization.spec.ts
git commit -m "test(e2e): prioritization standalone, chat, and no-tasks scenarios" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Run the full verification plan

**Type:** mechanical

Execute every check from the spec's Testing & Verification section as the final gate. Run-only — all code already exists.

- [ ] **Step 1: Static checks**

```bash
npm run typecheck
npm run lint
npm run build
```
Expected: typecheck 0 errors; lint passes (Biome + directive guard); build succeeds.

- [ ] **Step 2: Full Vitest suite**

Run: `npm run test`
Expected: PASS — includes `use-cases/__tests__/prioritization-agent.test.ts` (3 cases), the new `tasksService.getTask` cases, and the chat-agent prioritization case; no regressions.

- [ ] **Step 3: Full Playwright suite**

Run: `npm run test:e2e`
Expected: PASS — `e2e/prioritization.spec.ts` plus all existing specs (board, chat, subtasks, task-modal, smoke) still green.

- [ ] **Step 4: Viewport screenshots**

Start the dev server with the mock, then capture:

```bash
$env:MOCK_LLM="1"; npm run dev   # in a separate shell, or run the app per project conventions
node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000
```
Read the PNGs: at 1440×900 the "✨ What should I work on?" button sits in the header beside "New task" with no overflow; at 375×812 the board header still renders cleanly (the button is board-level, unaffected by the desktop-only chat panel).

- [ ] **Step 5: Manual real-key reasoning check (run once before closing the phase)**

With `ANTHROPIC_API_KEY` set and `MOCK_LLM` unset: seed a board with a **stale high-priority `todo`** and a **fresh medium `in-progress`** → click "✨ What should I work on?" → confirm the agent recommends the stale high `todo`, with reasoning citing its age and priority. (This is the only check of reasoning quality; the mock is position-based.)

- [ ] **Step 6: Confirm skipped categories**

No action needed — API smoke (curl) is skipped (standalone path is a Server Action; chat route is covered by e2e scenario 2), and DB checks are skipped (Phase 5 is read-only: no schema changes, nothing persisted).

---

## Self-Review

**1. Spec coverage:**
- Pool = `todo` + `in-progress`, empty → immediate no-tasks without LLM → Task 2 use-case + integration test (empty-pool case) + Task 6 no-tasks e2e. ✅
- Agent reasons and returns `{ taskId, reasoning }` through the `listTasks` → `recommend` loop → Task 2 (tools + use-case + mock) + integration test + Task 7 manual check. ✅
- Three priority levels, "CRITICAL" → `high`, no schema change → no schema task exists (read-only). ✅
- System prompt content (role, app context, process, four priors, four worked examples) → Task 2 Step 3 (full prompt). ✅
- Chat trigger replaces the stub, returns a recommendation with a task link → Task 3 (rewire + chat mock branch + test) + Task 6 chat e2e. ✅
- Standalone button → dialog (loading/recommendation/no-tasks/error) → navigation → Task 4 (action + hook) + Task 5 (dialog + button + board) + Task 6 standalone e2e + Task 7 screenshots. ✅
- `tasksService.getTask` for correctly-layered enrichment → Task 1. ✅
- `getPrioritizationModel()` + `claude-haiku-4-5` default + `ANTHROPIC_MODEL` override + offline mock → Task 2 Step 5. ✅
- shadcn `Dialog` (state overlay, not intercepting route) → reused from existing `shared/ui/dialog.tsx` (already installed; no shadcn CLI step needed). ✅

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step shows complete code; the system prompt is written in full. ✅

**3. Type consistency:** `PrioritizationResult` defined once in Task 1, imported by use-case/chat tool/action/hook/dialog. `recommendSchema` defined in Task 2 tools.ts, reused in the use-case. `runPrioritization` (use-case) aliased to `runPrioritizationAgent` in the chat tool to avoid the const clash. `prioritizationTools`, `NO_TASKS_MESSAGE`, `SYSTEM_PROMPT`, `getPrioritizationModel`, `pickRecommendedId`, `countToolMessages` names are used consistently. The use-case extracts the recommend call via `result.steps.flatMap(...)` (not `result.toolCalls`, which is last-step-only). ✅

**4. Verification coverage:** The spec's only named Vitest case (prioritization integration test, three states) appears as code in Task 2. All three Playwright e2e scenarios appear as code in Task 6. The final task (Task 7) runs the full verification plan (static, vitest, e2e, screenshots, manual real-key, skipped-category confirmation). ✅

**5. Task metadata:** Every task carries a `Type` (logic/mechanical). ✅
