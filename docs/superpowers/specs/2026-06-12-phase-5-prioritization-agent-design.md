# Phase 5 — Prioritization Agent: Design Spec

> ROADMAP: Phase 5 — Prioritization agent

Add the prioritization sub-agent to DevLog: a **senior product manager** that
looks at the board and recommends the single task the developer should start
**right now**, with reasoning. It is a real multi-step agent — it calls
`listTasks` itself and ends with a structured recommendation (agent-invoking-agent,
per DESIGN.md §6.2). It returns **`{ taskId, reasoning }`** and is reachable two
ways:

- **In chat** — replaces the Phase 4 `runPrioritization` tool stub
  (`use-cases/chat-agent/tools.ts:237`).
- **Standalone** — a "✨ What should I work on?" button in the board top bar →
  a result dialog showing the recommended task (linked) + the reasoning.

Both paths run the same use-case. The whole phase is read-only: no schema
changes, no new tables, nothing persisted.

## Decisions made during brainstorming

- **Phase 4 is already implemented** (the ROADMAP `[ ]` checkbox is stale). The
  chat agent, its tools, the `/api/chat` route, the chat panel, and the
  `getChatModel()` mock all exist. This phase **replaces the real
  `runPrioritization` stub** in `use-cases/chat-agent/tools.ts` (currently
  returns `"Prioritization is not available yet."`) and wires a second entry
  point — it does not build the chat agent.
- **No hard pool gate** (chosen over "any medium/high in-progress locks the
  pool" and over "high locks / medium negotiable"). The pool is `todo` +
  `in-progress`; the agent reasons over it with strong priors. This matches the
  user's emphasis on common sense and removes the contradiction between the
  pool rule and the worked examples.
- **Empty pool short-circuits without an LLM call.** If `todo` + `in-progress`
  is empty, the use-case returns the "no tasks" result immediately — the agent
  only runs when there is a real choice (the user's "if 0 tasks → answer right
  away").
- **Three priority levels kept** (`low | medium | high`). The schema has no
  `critical`; the user's "CRITICAL" examples map to **`high`**. No schema change
  (a 4th level would ripple across every phase).
- **Standalone result = a shadcn `Dialog` (state overlay), not an intercepting
  route.** Chosen over rendering into the chat panel (desktop-only, dead below
  1024px) and over a toast+card-highlight (truncates reasoning). A prioritization
  result is transient and non-route-worthy, so the project's
  modal-via-intercepting-route convention deliberately does not apply here.
- **Structured output via a terminal `recommend({ taskId, reasoning })` tool**
  (chosen over `experimental_output`): version-stable (no experimental SDK
  surface) and trivially deterministic to mock. Minor, justified deviation from
  DESIGN.md §6.2's "tool: `listTasks`" — the sub-agent has two tools, one of
  which exists only to capture the final structured answer.
- **Same model as chat** (`claude-haiku-4-5` default, `ANTHROPIC_MODEL`
  override) via a new `getPrioritizationModel()` factory with its own offline
  mock. No new env var.
- **Layering:** the prioritization agent is a **use-case**
  (`use-cases/prioritization-agent/`), reused by the chat tool and the standalone
  Server Action. Agents are orchestration (LLM infra + a service + a tool loop)
  and live in use-cases per the Phase 4 precedent; the "single service → no
  use-case" rule targets plain CRUD, not agent orchestration. A sibling use-case
  invoking another (chat tool → prioritization use-case) is the
  agent-invoking-agent pattern fixed by DESIGN.md §6.1–6.2.

## 1. Behavior — pool & selection (the heart of the phase)

**Pool.** Candidate tasks = every task in `todo` plus every task in
`in-progress`. `done` tasks are never recommended.

- If the pool is **empty**, return `{ task: null, reasoning: NO_TASKS_MESSAGE }`
  **without invoking the LLM**.
- Otherwise, the agent picks **exactly one** task from the pool using judgment,
  taught through priors and worked examples — not a rigid algorithm.

**Priors the agent reasons with** (no strict precedence; common sense
reconciles them):

1. **Anti-thrash (WIP).** Prefer finishing work already `in-progress` over
   starting something new — context-switching and half-done tasks hurt the
   project.
2. **Priority.** Higher priority generally comes first.
3. **Aging.** An old high-priority task that has been waiting (`createdAt` far in
   the past) can outweigh continuing a *fresh* in-progress one — but if the
   in-progress task is itself the older one, continue it.
4. **Content / dependency (common sense).** When priority and age don't decide
   it, read the titles and descriptions: foundational / architectural /
   unblocking work (DB setup, auth, shared infra) comes before work that depends
   on it (CRUD features).

**Output.** The chosen task's id + a concise reasoning that names the signals
used (priority, age, in-progress status, dependency).

## 2. System prompt — required content

The exact wording is written and iterated during implementation (per the
ROADMAP: "Prompt written and iterated separately"). The spec fixes only what the
prompt must convey:

- **Role & goal:** "You are a senior product manager. Help the developer decide
  the single task to start **right now** for maximum effectiveness."
- **App context:** DevLog is a kanban tracker; statuses `todo` / `in-progress` /
  `done`; priorities `low` / `medium` / `high`; each task has a title,
  description, `createdAt`, status, priority.
- **Process:** call `listTasks` → form the pool (`todo` + `in-progress`) → pick
  one task → call `recommend` with its id + reasoning. Use **only** task ids
  returned by `listTasks`; never invent an id.
- **The four priors** from §1, in plain language.
- **Four worked examples** that teach the reasoning:
  1. **Aging beats WIP** — `in-progress` medium "X" created today vs. `todo` high
     "Y" created 3 weeks ago → recommend **Y** (high priority, rotting for weeks;
     the in-progress item is fresh and cheap to resume).
  2. **WIP wins** — `in-progress` medium "X" created 2 weeks ago vs. `todo` high
     "Y" created yesterday → **continue X** (finishing the long-open item beats
     starting a brand-new one).
  3. **Dependency / content** — all `todo`, same priority, none notably older;
     "Set up the database schema" vs. "Build the task CRUD UI" → **DB schema
     first** (foundational; the CRUD work depends on it).
  4. **No tasks** — only `done` / empty board → "There is nothing to work on
     right now."

## 3. Sub-agent & structured output

`use-cases/prioritization-agent/index.ts` exports
`runPrioritization(): Promise<ActionResult<PrioritizationResult>>`:

1. `const board = tasksService.listBoard()`. Pool = `board.todo` +
   `board["in-progress"]`. If empty → return
   `{ ok: true, data: { task: null, reasoning: NO_TASKS_MESSAGE } }`. No LLM
   call.
2. Otherwise run the sub-agent:
   `generateText({ model: getPrioritizationModel(), system: SYSTEM_PROMPT,
   tools: { listTasks, recommend }, prompt: "Recommend the single task to start
   right now.", stopWhen: stepCountIs(6) })`. The loop: step 1 → `listTasks`
   (full board), step 2 → `recommend({ taskId, reasoning })`.
3. Extract the `recommend` tool call's validated input from the result. If the
   agent produced no `recommend` call → return
   `{ ok: false, error: "The prioritization agent did not return a
   recommendation." }`.
4. **Validate & enrich:** `const task = tasksService.getTask(taskId)`. If the id
   is empty, the task does not exist, or it is not in the pool (`done`), return
   `{ ok: false, error: "Could not resolve the recommended task." }` (guards
   against a hallucinated id). Otherwise return
   `{ ok: true, data: { task, reasoning } }`.

**Tools** (`use-cases/prioritization-agent/tools.ts`):

- `listTasks` — no arguments; thin wrapper over `tasksService.listBoard()`,
  returns the whole board (all three columns, each task with `createdAt`,
  `status`, `priority`, `title`, `description`). Purpose-built and separate from
  the chat agent's filtered `listTasks`; if a third agent needs a shared tool,
  extract one then (rule of three).
- `recommend` — input `z.object({ taskId: z.string(), reasoning: z.string()
  .min(1) })`; `execute` returns its input (so the loop closes cleanly). It
  exists only to capture the final structured answer; the use-case reads its
  arguments and ignores any trailing model text.

`stepCountIs(6)` is the runaway guard (a healthy run is 2 steps).

## 4. Architecture & files

```
use-cases/prioritization-agent/
  system-prompt.ts        SYSTEM_PROMPT (+ NO_TASKS_MESSAGE) — §2
  tools.ts                listTasks (full board) + recommend (terminal) — §3
  index.ts                runPrioritization(): ActionResult<PrioritizationResult>
use-cases/__tests__/
  prioritization-agent.test.ts   integration test, three board states — §8

shared/types/prioritization.ts   PrioritizationResult (used by use-case, tool,
                                  action, hook, dialog → shared/types)
shared/infra/llm.ts              + getPrioritizationModel(); + a prioritization
                                  branch in createMockChatModel — §7
services/tasks-service.ts        + getTask(id): Task | null (wraps
                                  tasksRepository.findById)
use-cases/chat-agent/tools.ts    runPrioritization stub → calls the use-case,
                                  returns ActionResult<PrioritizationResult>;
                                  description updated

app/actions/prioritize.ts        prioritizeAction(): ActionResult<PrioritizationResult>
                                  (controller; 'use server')
shared/hooks/use-prioritization.ts  useMutation wrapper over prioritizeAction
app/_components/prioritize-button.tsx          top-bar button + result dialog
app/_components/prioritization-result-dialog.tsx  the Dialog body (states)
```

`PrioritizationResult = { task: Task | null; reasoning: string }`.

**`tasksService.getTask`** is a minimal, correctly-layered addition: controllers
and use-cases must reach data through the service, not the repository directly,
and the standalone path needs the recommended task's `title` / `priority` /
`status` to render the dialog.

## 5. Data flow

**Chat path.** User asks "what should I start with?" → the chat agent calls the
`runPrioritization` tool (input `{}`) → its `execute` calls
`prioritizationAgent.runPrioritization()` → returns
`ActionResult<PrioritizationResult>` as the tool result. The parent chat agent
reads `{ task, reasoning }` and composes its HTML answer, linking the task as
`<a href="/tasks/{task.id}">{task.title}</a>` (Phase 4 rendering, unchanged).

**Standalone path.** Click "✨ What should I work on?" → `use-prioritization`
mutation calls `prioritizeAction()` (Server Action) →
`prioritizationAgent.runPrioritization()` → result rendered in the dialog. No
streaming (`generateText`, not `streamText`), consistent with the SDK split:
`streamText` for chat, `generateText` for the sub-agent.

## 6. Standalone UI

- **Button** "✨ What should I work on?" in the board header, beside "New task"
  (`app/_components/board.tsx` header, `app/_components/prioritize-button.tsx`).
- **Result dialog** (shadcn `Dialog` — install via the shadcn CLI if not already
  present; it is not yet in `shared/ui/`). States:
  - **Loading** — while the mutation runs (the agent makes a live call): a
    spinner + "Thinking…".
  - **Recommendation** — the task as a clickable `/tasks/{id}` link, its priority
    badge, and the reasoning text. A "Go to task" action closes the dialog and
    `router.push("/tasks/{id}")` (opens the existing intercepting-route task
    modal).
  - **No tasks** — `task === null`: render the reasoning ("Nothing to work on
    right now.").
  - **Error** — `ok: false`: a readable line + the button stays usable to retry.

## 7. MOCK_LLM

`getPrioritizationModel()` in `shared/infra/llm.ts`: returns
`anthropic(process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5")` normally; when
`MOCK_LLM === "1"` returns a scripted `MockLanguageModelV2` driving the loop
deterministically:

- **Step 1** → tool-call `listTasks {}`.
- **Step 2** (the prompt now contains the board from the tool result) → tool-call
  `recommend` with `taskId` = the first `in-progress` task's id, else the first
  `todo` task's id, else `""`; `reasoning` = a fixed deterministic sentence. The
  mock reads the board JSON out of the latest tool message to choose.

This covers the three checkpoint states offline (has in-progress / only todo /
all done) without a real key.

**Chat mock branch.** `createMockChatModel` gains a prioritization branch so the
chat path runs offline: a user message containing `start with` (or prefixed
`prioritize:`) → step 1 calls the `runPrioritization` tool `{}`; step 2 (after
the tool result, which carries the recommended task and its id) → emits text with
`<a href="/tasks/{id}">…</a>`.

## 8. Testing & Verification

### E2E tests (Playwright) — core scenarios

`e2e/prioritization.spec.ts`, dev server with `MOCK_LLM=1` (reuses the isolated
`.e2e` DB infra from Phase 2; seed via `e2e/helpers.ts`).

- **Standalone recommend + navigate (main happy path):** seed a board with at
  least one `in-progress` and one `todo` task → click "What should I work on?" →
  the result dialog appears with a recommended task link + reasoning text → click
  "Go to task" → the task modal opens at `/tasks/<id>`. (Exercises button →
  action → use-case → agent loop → enrich → dialog → navigation.)
- **Chat path:** in the chat panel, send `what should I start with?` → a
  `runPrioritization` tool card appears → the assistant reply renders with a
  `/tasks/<id>` link. (Exercises the rewired chat tool end-to-end through
  `/api/chat`.)
- **No-tasks edge:** on a board whose pool is empty (only `done`, or empty) →
  click the button → the dialog shows the "nothing to work on" message and does
  not crash.

> The mock picks by board position, not age/priority, so e2e verifies the
> **wiring**, not the reasoning quality. The reasoning is verified by the manual
> real-key check below.

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes (Biome + directive guard)
- `npm run build` — builds successfully

### Unit/integration tests (Vitest)

- `use-cases/__tests__/prioritization-agent.test.ts` (temp SQLite +
  `getPrioritizationModel` mock) — the ROADMAP checkpoint, one test with three
  cases:
  - **has in-progress** → `result.data.task` is one of the seeded `in-progress`
    tasks.
  - **only todo** → `result.data.task` is a seeded `todo` task.
  - **all done / empty pool** → `result.data.task` is `null` and `reasoning` is
    the no-tasks message.

  This is the only isolated test — it covers the agent loop, the pool
  short-circuit, and id enrichment offline. No per-tool or per-branch cases: the
  underlying `tasksService` is tested in Phases 1–2 and the wiring is covered by
  e2e.

### Viewport screenshots

- Dev server with `MOCK_LLM=1`:
  `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000`
- Read the PNGs: at 1440×900 the "What should I work on?" button sits in the
  header beside "New task" with no overflow; at 375×812 the board header still
  renders cleanly (the button is board-level, unaffected by the desktop-only chat
  panel).

### Manual check with a real key (the reasoning the phase is about)

- With `ANTHROPIC_API_KEY` set and `MOCK_LLM` off: seed a board with a **stale
  high-priority `todo`** and a **fresh medium `in-progress`** → "What should I
  work on?" → the agent recommends the stale high `todo`, with reasoning citing
  its age and priority. Run once before closing the phase.

### Skipped categories

- **API smoke (curl):** skipped — the standalone path is a Server Action (no REST
  route), and the chat route is driven by e2e scenario 2.
- **DB checks:** skipped — Phase 5 is read-only; no schema changes, nothing
  persisted.

### Requirement coverage

- Pool = todo + in-progress, empty → immediate no-tasks → integration test
  (all-done case) + e2e no-tasks edge
- Agent reasons and returns `{ taskId, reasoning }` through the loop →
  integration test + manual real-key check
- Chat trigger returns a recommendation with a task link → e2e chat path +
  chat mock branch
- Standalone button → dialog → task navigation → e2e standalone scenario +
  desktop screenshot
- Reasoning quality (age/priority/dependency) → manual real-key check

## 9. Out of scope (later phases)

Task decomposition (Phase 6). Status-update generation (Phase 7). Persisting or
ranking the whole board (this recommends one task, it does not reorder). A 4th
priority level. Reasoning-quality automated tests (mock is position-based;
quality is a manual real-key check).
