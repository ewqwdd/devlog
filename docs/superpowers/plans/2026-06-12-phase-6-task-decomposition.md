# Phase 6 — Task Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ✨ Decompose button to the task modal that asks a team-lead agent (one `generateObject` call) to suggest ordered subtasks, which the user edits in a client-side draft and then bulk-saves in a single DB write.

**Architecture:** A read-only use-case (`use-cases/decompose-agent`) makes a single structured `generateObject` call and returns `{ subtasks, reasoning }` — `subtasks: []` is the "too vague" signal. The suggestions live only in React state until the user clicks Save, which calls a separate bulk-insert Server Action (`createSubtasksAction` → `createSubtasks` → `repository.createMany`). Generation writes nothing; Save is the one and only DB write. Same model + offline-mock pattern as the Phase 4/5 agents.

**Tech Stack:** Next.js App Router + TypeScript strict, Vercel AI SDK (`generateObject`, `MockLanguageModelV2`), zod v4, Drizzle + SQLite, TanStack Query, Tailwind v4 + shadcn/ui, Vitest + Playwright, Biome.

---

## File Structure

**Create**
- `shared/types/decompose.ts` — `SubtaskDraft`, `DecomposeResult` (Task 1); extended with `DraftRow`, `DecomposeStatus` (Task 3).
- `use-cases/decompose-agent/schema.ts` — `decomposeSchema` (structured-output contract).
- `use-cases/decompose-agent/system-prompt.ts` — `DECOMPOSE_SYSTEM_PROMPT`.
- `use-cases/decompose-agent/index.ts` — `decomposeTask(taskId)`.
- `use-cases/__tests__/decompose-agent.test.ts` — integration test (temp SQLite + mock).
- `app/actions/decompose.ts` — `decomposeTaskAction(taskId)` controller.
- `shared/hooks/use-decompose-task.ts` — generate mutation hook.
- `shared/hooks/use-create-subtasks-mutation.ts` — bulk-save mutation hook.
- `shared/ui/alert.tsx` — shadcn `alert` (installed via CLI).
- `components/decompose-preview.tsx` — presentational draft preview (Alert + editable rows + Save/Discard).
- `e2e/decompose.spec.ts` — 3 Playwright scenarios.

**Modify**
- `shared/infra/llm.ts` — add `getDecomposeModel()` + its `MOCK_LLM` branch.
- `shared/repositories/subtasks-repository.ts` — add `createMany(rows)`.
- `services/subtasks-service.ts` — add `createSubtasks(taskId, titles)`.
- `app/actions/subtasks.ts` — add `createSubtasksAction({ taskId, titles })`.
- `components/subtask-section.tsx` — Decompose button in header; owns transient draft state; renders `<DecomposePreview>`.

> `services/tasks-service.ts` already exports `getTask(id): Task | null` (Phase 5) — reused as-is, no change needed.

---

### Task 1: Decompose agent + read wiring

**Type:** logic

The whole read-only path: types → schema → system prompt → mock model → `decomposeTask` use-case → action → hook. The Vitest integration test (temp SQLite + the offline mock) is the TDD target for the agent contract; the thin action/hook wrappers mirror the Phase 5 `prioritizeAction`/`usePrioritization` pair and are verified end-to-end by the e2e in Task 4.

**Files:**
- Create: `use-cases/__tests__/decompose-agent.test.ts`
- Create: `shared/types/decompose.ts`
- Create: `use-cases/decompose-agent/schema.ts`
- Create: `use-cases/decompose-agent/system-prompt.ts`
- Modify: `shared/infra/llm.ts` (append `getDecomposeModel` + mock factory)
- Create: `use-cases/decompose-agent/index.ts`
- Create: `app/actions/decompose.ts`
- Create: `shared/hooks/use-decompose-task.ts`

- [ ] **Step 1: Write the failing integration test**

Create `use-cases/__tests__/decompose-agent.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- decompose-agent`
Expected: FAIL — cannot resolve `@/use-cases/decompose-agent` (module does not exist yet).

- [ ] **Step 3: Create the shared types**

Create `shared/types/decompose.ts`:

```ts
// A single suggested subtask before it is persisted. The agent returns these and
// the Save path turns them into real subtask rows.
export interface SubtaskDraft {
  readonly title: string;
}

// The result of one decomposition call. `subtasks: []` is the "too vague" signal;
// `reasoning` is always present (a split summary on success, the why on refusal).
export interface DecomposeResult {
  readonly subtasks: SubtaskDraft[];
  readonly reasoning: string;
}
```

- [ ] **Step 4: Create the structured-output schema**

Create `use-cases/decompose-agent/schema.ts`:

```ts
import { z } from "zod";

// The structured-output contract for generateObject. An empty `subtasks` array is
// the "too vague" signal; the 12-item cap is a runaway guard. `reasoning` is always
// present.
export const decomposeSchema = z.object({
  subtasks: z
    .array(z.object({ title: z.string().trim().min(1).max(200) }))
    .max(12),
  reasoning: z.string().trim().min(1),
});
```

- [ ] **Step 5: Create the system prompt**

Create `use-cases/decompose-agent/system-prompt.ts`:

```ts
export const DECOMPOSE_SYSTEM_PROMPT = `You are an experienced team lead. Break the given task into a small, ordered set of concrete subtasks that can be executed one after another.

App context:
- A DevLog task has a title and a description. Subtasks are a single, flat level — each is just a short title — and are done in order.

Quality bar:
- Subtasks must be concrete, non-overlapping, and ordered by execution (earliest first).
- Prefer a few meaningful steps over many trivial ones. No filler, no "miscellaneous" catch-alls.

Refusal rule:
- If the title and description are too vague or ambiguous to produce meaningful subtasks, return an EMPTY subtasks array and put a short, specific reason in "reasoning" — name what is missing (a clearer goal, scope, or acceptance criteria).
- Never invent a decomposition for an empty or one-word task.

Always fill "reasoning": a one-line summary of how you split the task on success, or the specific reason you could not decompose it.`;
```

- [ ] **Step 6: Add `getDecomposeModel()` to the LLM infra**

Append to `shared/infra/llm.ts` (after the existing `getPrioritizationModel` export, at the end of the file). The new mock reuses the module-scoped `lastUserText` and `USAGE` helpers already defined in this file:

```ts
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
```

> Note: `generateObject` calls `doGenerate({ responseFormat: { type: "json", ... } })` and reads the text content as JSON. The mock ignores `responseFormat` and returns the object as a JSON string in `content` — this is the supported `MockLanguageModelV2` pattern (verified against `ai@5`).

- [ ] **Step 7: Create the use-case**

Create `use-cases/decompose-agent/index.ts`:

```ts
import { generateObject } from "ai";
import { tasksService } from "@/services/tasks-service";
import { getDecomposeModel } from "@/shared/infra/llm";
import { logger } from "@/shared/lib/logger";
import type { ActionResult } from "@/shared/types/action-result";
import type { DecomposeResult } from "@/shared/types/decompose";
import { decomposeSchema } from "@/use-cases/decompose-agent/schema";
import { DECOMPOSE_SYSTEM_PROMPT } from "@/use-cases/decompose-agent/system-prompt";

// Single structured call: reads the task's title + description and returns ordered
// subtask suggestions (or an empty list + a reason). Read-only — writes nothing.
export async function decomposeTask(
  taskId: string,
): Promise<ActionResult<DecomposeResult>> {
  const task = tasksService.getTask(taskId);
  if (!task) {
    return { ok: false, error: "Task not found" };
  }

  try {
    const model = await getDecomposeModel();
    const { object } = await generateObject({
      model,
      system: DECOMPOSE_SYSTEM_PROMPT,
      schema: decomposeSchema,
      prompt: `Title: ${task.title}\n\nDescription: ${task.description}`,
    });
    return {
      ok: true,
      data: { subtasks: object.subtasks, reasoning: object.reasoning },
    };
  } catch (error) {
    logger.error({ error }, "Decompose agent failed");
    return { ok: false, error: "The decomposition agent failed. Try again." };
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- decompose-agent`
Expected: PASS — both cases (clear → ≥1 subtask, vague → 0 subtasks, both with non-empty reasoning).

- [ ] **Step 9: Create the Server Action (controller)**

Create `app/actions/decompose.ts`:

```ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/shared/types/action-result";
import type { DecomposeResult } from "@/shared/types/decompose";
import { decomposeTask } from "@/use-cases/decompose-agent";

const decomposeInputSchema = z.object({ taskId: z.uuid() });

export async function decomposeTaskAction(
  taskId: string,
): Promise<ActionResult<DecomposeResult>> {
  const parsed = decomposeInputSchema.safeParse({ taskId });
  if (!parsed.success) {
    return { ok: false, error: "Invalid task id" };
  }
  return decomposeTask(parsed.data.taskId);
}
```

- [ ] **Step 10: Create the generate mutation hook**

Create `shared/hooks/use-decompose-task.ts`:

```ts
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { decomposeTaskAction } from "@/app/actions/decompose";
import type { DecomposeResult } from "@/shared/types/decompose";

export interface UseDecomposeTaskOptions {
  onError?: (error: Error) => void;
}

// Generation is read-only: no cache invalidation here. The caller handles the
// returned DecomposeResult (preview vs. refusal) via mutate's onSuccess.
export function useDecomposeTask(
  taskId: string,
  options: UseDecomposeTaskOptions = {},
): UseMutationResult<DecomposeResult, Error, void> {
  return useMutation({
    mutationFn: async (): Promise<DecomposeResult> => {
      const result = await decomposeTaskAction(taskId);
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

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 12: Commit**

```bash
git add shared/types/decompose.ts use-cases/decompose-agent shared/infra/llm.ts use-cases/__tests__/decompose-agent.test.ts app/actions/decompose.ts shared/hooks/use-decompose-task.ts
git commit -m "feat: decompose agent — single-shot structured call + read wiring"
```

---

### Task 2: Save path — bulk persist

**Type:** logic

The one and only DB write: repository bulk insert → service that computes positions and drops blanks → controller action → invalidating mutation hook. Per the spec's verification plan there is **no dedicated unit test** for this layer (it is plain CRUD that mirrors the existing single-row subtask path); it is exercised end-to-end by the e2e happy path in Task 4. Static checks confirm the types here.

**Files:**
- Modify: `shared/repositories/subtasks-repository.ts` (add `createMany`)
- Modify: `services/subtasks-service.ts` (add `createSubtasks`)
- Modify: `app/actions/subtasks.ts` (add `createSubtasksAction`)
- Create: `shared/hooks/use-create-subtasks-mutation.ts`

- [ ] **Step 1: Add `createMany` to the repository**

In `shared/repositories/subtasks-repository.ts`, add this method to the `subtasksRepository` object (after `create`, keeping the object shape). `NewSubtask` is already imported at the top of the file:

```ts
  createMany(rows: NewSubtask[]): Subtask[] {
    return db.insert(subtasks).values(rows).returning().all();
  },
```

- [ ] **Step 2: Add `createSubtasks` to the service**

In `services/subtasks-service.ts`, add this method to the `subtasksService` object (after `createSubtask`):

```ts
  createSubtasks(taskId: string, titles: string[]): Subtask[] {
    const clean = titles.map((title) => title.trim()).filter((t) => t.length > 0);
    if (clean.length === 0) {
      return [];
    }
    const base = (subtasksRepository.getMaxPosition(taskId) ?? -1) + 1;
    const rows = clean.map((title, index) => ({
      taskId,
      title,
      position: base + index,
    }));
    return subtasksRepository.createMany(rows);
  },
```

- [ ] **Step 3: Add `createSubtasksAction` to the subtasks action file**

In `app/actions/subtasks.ts`, add the schema next to the other schemas (reusing the existing module-scoped `titleSchema`):

```ts
const createSubtasksSchema = z.object({
  taskId: z.uuid(),
  titles: z.array(titleSchema).min(1, "At least one subtask is required"),
});
```

and add the action (reusing the existing `firstIssue` / `toErrorResult` helpers):

```ts
export async function createSubtasksAction(
  input: unknown,
): Promise<ActionResult<Subtask[]>> {
  const parsed = createSubtasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    return {
      ok: true,
      data: subtasksService.createSubtasks(
        parsed.data.taskId,
        parsed.data.titles,
      ),
    };
  } catch (error) {
    return toErrorResult(error);
  }
}
```

- [ ] **Step 4: Create the bulk-save mutation hook**

Create `shared/hooks/use-create-subtasks-mutation.ts`:

```ts
import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createSubtasksAction } from "@/app/actions/subtasks";
import { subtasksKey } from "@/shared/hooks/use-subtasks-query";
import type { Subtask } from "@/shared/types/subtask";

export interface UseCreateSubtasksMutationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// Bulk persist the decomposition draft in one write, then invalidate so the real
// subtask list re-fetches and shows the new rows.
export function useCreateSubtasksMutation(
  taskId: string,
  options: UseCreateSubtasksMutationOptions = {},
): UseMutationResult<Subtask[], Error, string[]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (titles: string[]): Promise<Subtask[]> => {
      const result = await createSubtasksAction({ taskId, titles });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subtasksKey(taskId) });
      options.onSuccess?.();
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add shared/repositories/subtasks-repository.ts services/subtasks-service.ts app/actions/subtasks.ts shared/hooks/use-create-subtasks-mutation.ts
git commit -m "feat: bulk-persist subtasks (the Save write path)"
```

---

### Task 3: Decompose UI — button + editable draft preview

**Type:** logic

Install the shadcn `alert`, extend the decompose types with the two UI types, build the presentational `DecomposePreview`, and wire the transient draft state into `SubtaskSection`. The button + preview live in `components/` (the task modal is an intercepting route with a full-page fallback → two consumers), per the component-placement rule.

**Files:**
- Create: `shared/ui/alert.tsx` (via shadcn CLI)
- Modify: `shared/types/decompose.ts` (add `DraftRow`, `DecomposeStatus`)
- Create: `components/decompose-preview.tsx`
- Modify: `components/subtask-section.tsx`

- [ ] **Step 1: Install the shadcn `alert` component**

Run: `npx shadcn@latest add alert`
Expected: creates `shared/ui/alert.tsx` exporting `Alert`, `AlertTitle`, `AlertDescription` (the `ui` alias resolves to `@/shared/ui`). If prompted, accept defaults / do not overwrite other files. Confirm the file exists:

Run: `npm run typecheck`
Expected: 0 errors (the new file compiles).

- [ ] **Step 2: Extend the decompose types with the two UI types**

Append to `shared/types/decompose.ts`:

```ts
// The decomposition section's UI state machine.
export type DecomposeStatus =
  | "idle"
  | "loading"
  | "preview"
  | "refused"
  | "error";

// One editable draft row in the preview. `key` is a client-only React key with no
// relation to any DB id.
export interface DraftRow {
  readonly key: string;
  readonly title: string;
}
```

- [ ] **Step 3: Create the presentational preview component**

Create `components/decompose-preview.tsx`:

```tsx
"use client";

import { RiCloseLine } from "@remixicon/react";
import type React from "react";
import type { DecomposeStatus, DraftRow } from "@/shared/types/decompose";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function DecomposePreview({
  status,
  reasoning,
  drafts,
  isSaving,
  onRenameDraft,
  onRemoveDraft,
  onSave,
  onDiscard,
  onDismiss,
}: {
  status: DecomposeStatus;
  reasoning: string;
  drafts: DraftRow[];
  isSaving: boolean;
  onRenameDraft: (key: string, title: string) => void;
  onRemoveDraft: (key: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDismiss: () => void;
}): React.JSX.Element | null {
  if (status === "idle") {
    return null;
  }

  if (status === "loading") {
    return (
      <div
        data-testid="decompose-preview"
        className="mb-3 text-[13px] text-muted-foreground"
      >
        Decomposing…
      </div>
    );
  }

  if (status === "refused" || status === "error") {
    const message =
      status === "error" ? "Couldn't decompose. Try again." : reasoning;
    return (
      <div data-testid="decompose-preview" className="mb-3">
        <Alert variant="destructive" data-testid="decompose-alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="decompose-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  // status === "preview"
  const validCount = drafts.filter((d) => d.title.trim().length > 0).length;
  return (
    <div data-testid="decompose-preview" className="mb-3 flex flex-col gap-2">
      <Alert data-testid="decompose-alert">
        <AlertDescription>{reasoning}</AlertDescription>
      </Alert>
      <div className="flex flex-col gap-1.5">
        {drafts.map((draft) => (
          <div
            key={draft.key}
            data-testid="decompose-draft-row"
            className="flex items-center gap-2"
          >
            <Input
              data-testid="decompose-draft-input"
              value={draft.title}
              onChange={(e): void => onRenameDraft(draft.key, e.target.value)}
              className="h-8 text-[13.5px]"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove subtask"
              data-testid="decompose-draft-remove"
              onClick={(): void => onRemoveDraft(draft.key)}
            >
              <RiCloseLine className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="decompose-discard"
          onClick={onDiscard}
        >
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="decompose-save"
          disabled={isSaving || validCount === 0}
          onClick={onSave}
        >
          Save {validCount}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the draft state into `SubtaskSection`**

Replace the entire contents of `components/subtask-section.tsx` with:

```tsx
"use client";

import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { DecomposePreview } from "@/components/decompose-preview";
import { SubtaskList } from "@/components/subtask-list";
import { useCreateSubtaskMutation } from "@/shared/hooks/use-create-subtask-mutation";
import { useCreateSubtasksMutation } from "@/shared/hooks/use-create-subtasks-mutation";
import { useDecomposeTask } from "@/shared/hooks/use-decompose-task";
import { useDeleteSubtaskMutation } from "@/shared/hooks/use-delete-subtask-mutation";
import { useMoveSubtaskMutation } from "@/shared/hooks/use-move-subtask-mutation";
import { useSubtasksQuery } from "@/shared/hooks/use-subtasks-query";
import { useUpdateSubtaskMutation } from "@/shared/hooks/use-update-subtask-mutation";
import type { DecomposeStatus, DraftRow } from "@/shared/types/decompose";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";

export function SubtaskSection({
  taskId,
}: {
  taskId: string;
}): React.JSX.Element {
  const [newTitle, setNewTitle] = useState("");

  const [status, setStatus] = useState<DecomposeStatus>("idle");
  const [reasoning, setReasoning] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  const { data: subtasks, isLoading } = useSubtasksQuery(taskId);

  const createMutation = useCreateSubtaskMutation(taskId, {
    onError: (err): void => {
      toast.error(err.message);
    },
  });
  const updateMutation = useUpdateSubtaskMutation(taskId, {
    onError: (): void => {
      toast.error("Could not update the subtask");
    },
  });
  const moveMutation = useMoveSubtaskMutation(taskId, {
    onError: (): void => {
      toast.error("Could not reorder the subtask");
    },
  });
  const deleteMutation = useDeleteSubtaskMutation(taskId, {
    onError: (): void => {
      toast.error("Could not delete the subtask");
    },
  });

  const decomposeMutation = useDecomposeTask(taskId, {
    onError: (): void => setStatus("error"),
  });
  const createSubtasksMutation = useCreateSubtasksMutation(taskId, {
    onSuccess: (): void => clearDraft(),
    onError: (): void => {
      toast.error("Could not save the subtasks");
    },
  });

  function clearDraft(): void {
    setStatus("idle");
    setDrafts([]);
    setReasoning("");
  }

  function handleDecompose(): void {
    setStatus("loading");
    decomposeMutation.mutate(undefined, {
      onSuccess: (data): void => {
        setReasoning(data.reasoning);
        if (data.subtasks.length === 0) {
          setDrafts([]);
          setStatus("refused");
        } else {
          setDrafts(
            data.subtasks.map((s) => ({
              key: crypto.randomUUID(),
              title: s.title,
            })),
          );
          setStatus("preview");
        }
      },
    });
  }

  function handleRenameDraft(key: string, title: string): void {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, title } : d)));
  }

  function handleRemoveDraft(key: string): void {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function handleSave(): void {
    const titles = drafts.map((d) => d.title.trim()).filter((t) => t.length > 0);
    if (titles.length === 0) {
      return;
    }
    createSubtasksMutation.mutate(titles);
  }

  function handleAdd(): void {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) {
      return;
    }
    createMutation.mutate(trimmed, {
      onSuccess: () => setNewTitle(""),
    });
  }

  const list = subtasks ?? [];
  const subTotal = list.length;
  const subDone = list.filter((s) => s.done).length;
  const pct = subTotal === 0 ? 0 : Math.round((subDone / subTotal) * 100);

  return (
    <section className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground/80">
          Subtasks
        </h3>
        <div className="flex items-center gap-2">
          {subTotal > 0 ? (
            <span className="text-[12.5px] font-semibold text-muted-foreground">
              {subDone} of {subTotal} done
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="decompose-button"
            disabled={status !== "idle"}
            onClick={handleDecompose}
          >
            {status === "loading" ? "Decomposing…" : "✨ Decompose"}
          </Button>
        </div>
      </div>

      {subTotal > 0 ? (
        <div className="mb-3.5 h-1.5 overflow-hidden rounded bg-muted-foreground/15">
          <div
            className="h-full rounded bg-[#22a06b] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <DecomposePreview
        status={status}
        reasoning={reasoning}
        drafts={drafts}
        isSaving={createSubtasksMutation.isPending}
        onRenameDraft={handleRenameDraft}
        onRemoveDraft={handleRemoveDraft}
        onSave={handleSave}
        onDiscard={clearDraft}
        onDismiss={clearDraft}
      />

      <div className="overflow-hidden rounded-[8px] border border-border">
        {isLoading ? (
          <div className="flex flex-col">
            <Skeleton className="h-10 w-full rounded-none" />
            <Skeleton className="h-10 w-full rounded-none" />
          </div>
        ) : (
          <SubtaskList
            taskId={taskId}
            subtasks={list}
            onMove={(vars): void => moveMutation.mutate(vars)}
            onToggle={(id, done): void =>
              updateMutation.mutate({ id, patch: { done } })
            }
            onRename={(id, title): void =>
              updateMutation.mutate({ id, patch: { title } })
            }
            onDelete={(id): void => deleteMutation.mutate(id)}
          />
        )}
        <div className="flex items-center gap-2 bg-muted/50 px-3 py-2.5">
          <Input
            data-testid="subtask-add-input"
            value={newTitle}
            placeholder="Add a subtask…"
            disabled={createMutation.isPending}
            onChange={(e): void => setNewTitle(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="h-8 text-[13.5px]"
          />
          <Button
            type="button"
            size="sm"
            data-testid="subtask-add-submit"
            disabled={createMutation.isPending}
            onClick={handleAdd}
          >
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors. (Biome may reorder imports in the new files; if it auto-fixes, re-run and re-stage.)

- [ ] **Step 6: Commit**

```bash
git add shared/ui/alert.tsx shared/types/decompose.ts components/decompose-preview.tsx components/subtask-section.tsx
git commit -m "feat: Decompose UI — button + editable draft preview"
```

---

### Task 4: E2E scenarios + full verification

**Type:** logic

Write the three Playwright scenarios from the spec (the e2e is deferred to this final phase), then run the complete verification plan. The dev server runs with `MOCK_LLM=1` (already set in `playwright.config.ts`'s `webServer.env`), so the mock returns the fixed 3-item list for clear titles and the empty list for titles containing `vague`.

**Files:**
- Create: `e2e/decompose.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `e2e/decompose.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test";

async function waitForBoardReady(page: Page): Promise<void> {
  await expect(page.getByTestId("column-todo")).toBeVisible();
}

// Create a uniquely-titled task via the UI and open its modal.
async function createTaskAndOpen(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  await waitForBoardReady(page);

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("create-submit").click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: title }).first(),
  ).toBeVisible();

  const cards = page.getByTestId("task-card").filter({ hasText: title });
  await cards.last().getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("modal-title")).toBeVisible();
}

async function subtaskTitles(page: Page): Promise<string[]> {
  const texts = await page.getByTestId("subtask-title").allInnerTexts();
  return texts.map((t) => t.trim());
}

// Unique suffix so re-runs against a reused server don't collide with prior rows.
function uid(): string {
  return Date.now().toString(36);
}

test("decompose -> edit -> save -> persist (happy path)", async ({ page }) => {
  await createTaskAndOpen(page, `Decompose-clear-${uid()}`);

  await page.getByTestId("decompose-button").click();
  await expect(page.getByTestId("decompose-alert")).toBeVisible();
  await expect(page.getByTestId("decompose-draft-row")).toHaveCount(3);

  const rows = page.getByTestId("decompose-draft-row");
  // rename the first draft
  await rows.nth(0).getByTestId("decompose-draft-input").fill("Plan it well");
  // remove the second draft ("Implement the core")
  await rows.nth(1).getByTestId("decompose-draft-remove").click();
  await expect(page.getByTestId("decompose-draft-row")).toHaveCount(2);

  await page.getByTestId("decompose-save").click();

  // preview clears; remaining edited titles become real subtasks, in order
  await expect(page.getByTestId("decompose-preview")).toHaveCount(0);
  await expect
    .poll(async () => await subtaskTitles(page))
    .toEqual(["Plan it well", "Write tests"]);

  await page.reload();
  await expect
    .poll(async () => await subtaskTitles(page))
    .toEqual(["Plan it well", "Write tests"]);
});

test("vague task -> refusal, nothing saved", async ({ page }) => {
  await createTaskAndOpen(page, `vague-${uid()}`);

  await page.getByTestId("decompose-button").click();
  await expect(page.getByTestId("decompose-alert")).toBeVisible();
  await expect(page.getByTestId("decompose-draft-row")).toHaveCount(0);
  await expect(page.getByTestId("decompose-save")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("subtask-item")).toHaveCount(0);
});

test("discard drops the draft (no write)", async ({ page }) => {
  await createTaskAndOpen(page, `Decompose-discard-${uid()}`);

  await page.getByTestId("decompose-button").click();
  await expect(page.getByTestId("decompose-draft-row").first()).toBeVisible();

  await page.getByTestId("decompose-discard").click();
  await expect(page.getByTestId("decompose-preview")).toHaveCount(0);
  await expect(page.getByTestId("subtask-item")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("subtask-item")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e -- decompose`
Expected: PASS — all 3 scenarios green. (Playwright starts the dev server with `MOCK_LLM=1` itself.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with 0 errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: passes (Biome + the TS-directive guard).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 6: Full unit/integration test run**

Run: `npm test`
Expected: all tests pass, including `use-cases/__tests__/decompose-agent.test.ts`.

- [ ] **Step 7: Viewport screenshots (run-only)**

Start a dev server with the mock, open a task, click **✨ Decompose** so the preview (Alert + editable rows + Save/Discard) is on screen, then capture it (the draft is transient client state, so screenshot the live page after triggering, not a fresh navigation):

Run: `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000/tasks/<id>`
Expected: read the PNGs — at 1440×900 the Decompose button sits cleanly in the subtask header and the preview block fits the modal without overflow; at 375×812 the rows and the Save/Discard bar wrap without clipping.

- [ ] **Step 8: Commit**

```bash
git add e2e/decompose.spec.ts
git commit -m "test: decompose e2e (decompose/edit/save, vague refusal, discard)"
```

---

## Self-Review

**1. Spec coverage**
- §1 three outcomes (decomposed / too vague / call failed) → Task 1 use-case + Task 3 `DecomposePreview` (`preview` / `refused` / `error` states). ✓
- §2 agent (getTask → generateObject → result; thrown error → logged failure) → Task 1 `decomposeTask`. ✓
- §2 schema + system prompt → Task 1 `schema.ts`, `system-prompt.ts`. ✓
- §3 types + `getDecomposeModel()` → Task 1 `shared/types/decompose.ts`, `shared/infra/llm.ts`. ✓
- §4 Save path (`createMany`, `createSubtasks`, `createSubtasksAction`, `use-create-subtasks-mutation`) → Task 2. ✓
- §5 draft lifecycle (generate read-only → state → Save one write → invalidate; Discard/close no write) → Task 3 `SubtaskSection`. ✓
- §6 alert install + UI + MOCK_LLM branching → Task 3 + Task 1 mock. ✓ All nine test ids present in `DecomposePreview`/`SubtaskSection`.
- §7 e2e (3 scenarios), static checks, Vitest integration (2 cases), screenshots → Tasks 1 & 4. ✓

**2. Placeholder scan** — no TBD/“add error handling”/“similar to Task N”. Every code step shows complete code. ✓

**3. Type consistency** — `decomposeTask(taskId): Promise<ActionResult<DecomposeResult>>`, `DecomposeResult.subtasks: SubtaskDraft[]` (schema infers `{title:string}[]`, assignable), `decomposeTaskAction(taskId: string)`, `useDecomposeTask` mutates `void` and uses `mutate(undefined, { onSuccess })`, `createSubtasks(taskId, titles[])`, `createMany(rows: NewSubtask[])`, `useCreateSubtasksMutation` mutates `string[]`. `DraftRow`/`DecomposeStatus` consumed identically in both components. ✓

**4. Verification coverage** — both Vitest cases (clear, vague) are real test code in Task 1; all three Playwright scenarios are real test code in Task 4; the final task runs typecheck, lint, build, full test, e2e, and screenshots. ✓

**5. Task metadata** — every task has a `Type` (all logic). ✓
