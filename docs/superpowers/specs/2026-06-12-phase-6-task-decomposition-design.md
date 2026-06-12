# Phase 6 — Task Decomposition: Design Spec

> ROADMAP: Phase 6 — Task decomposition

Add a **✨ Decompose** button to the task modal that asks a **team-lead agent** to
break the current task into a small, ordered set of subtasks. It is a **single
structured call** (`generateObject` with a zod schema) — not a multi-step tool
agent. The agent reads only the task's **title + description** and returns either
a list of suggested subtasks plus a one-line reasoning, or — when the task is too
vague to break down — an **empty list plus an explanation of why**.

The suggestions are a **client-side draft**: nothing is written to the database
at generation time. The user reviews them in an editable preview (rename rows,
remove rows), then **Save** persists them as real subtasks in one write, or
**Discard** drops them with zero DB writes. Auto-fill, never silent creation.

## Decisions made during brainstorming

- **Single-shot, no conversation** (chosen over the ROADMAP's "agent asks a
  clarifying question"). A vague task does not open a dialogue — the agent
  returns no subtasks and a `reasoning` string explaining why, shown in an Alert.
  The ROADMAP line is reworded to match (see §8). Simpler interaction, one call,
  trivially mockable.
- **Full inline edit of the draft before Save** (chosen over batch-only
  Save/Discard and over remove-only). Each previewed subtask is an editable input
  with a remove (×); the user renames and prunes freely, then Saves the result.
  Honors the ROADMAP's "user edits/confirms".
- **Draft is transient client state — never persisted until Save.** Generation is
  a read-only Server Action (the agent writes nothing). The drafts live in React
  state only (no DB row, no `localStorage`); closing the modal or reloading
  discards them. The database is touched exactly once, by the separate Save write.
- **Flat schema, empty list = "too vague"** (chosen over a top-level
  discriminated union). `generateObject` with a flat object
  `{ subtasks, reasoning }` is more reliable for structured output across SDK
  versions and trivially deterministic to mock; `subtasks.length === 0` is the
  refusal signal, and `reasoning` is always present (decomposition summary on
  success, the why on refusal).
- **Single `generateObject` call, no tool loop** (justified deviation from
  Phase 5's `generateText` + terminal tool). The ROADMAP fixes `generateObject`
  here; the task is a one-shot transform (title+description → subtasks), so no
  `listTasks`/tool step is needed. Same model + mock-factory pattern as Phase 4/5.
- **Layering: a use-case** (`use-cases/decompose-agent/`), reused by the Server
  Action. Agents are orchestration (LLM infra + a service + structured output)
  and live in use-cases per the Phase 4/5 precedent; the "single service → no
  use-case" rule targets plain CRUD, not agent orchestration.
- **Same model as the other agents** (`claude-haiku-4-5` default,
  `ANTHROPIC_MODEL` override) via a new `getDecomposeModel()` factory with its own
  offline mock. No new env var.

## 1. Behavior — the three outcomes

Click **✨ Decompose** → the button shows a spinner and disables → one
`decomposeTaskAction(taskId)` call → exactly one of:

| Outcome | Use-case returns | UI |
|---|---|---|
| **Decomposed** | `ok: true`, `subtasks: [...]` (≥1), `reasoning` | Info **Alert** (the reasoning) above an **editable draft list** + **Save N / Discard** bar |
| **Too vague** | `ok: true`, `subtasks: []`, `reasoning` (why) | Warning **Alert** with the reasoning + **Dismiss**. No rows, no Save |
| **Call failed** | `ok: false`, `error` | Destructive **Alert** ("Couldn't decompose. Try again.") + Dismiss; button re-enabled |

While loading or while a draft is pending, the Decompose button is hidden/disabled
(no stacking of multiple draft sets). Re-decomposing after a Save is allowed and
appends again.

## 2. The agent — single structured call

`use-cases/decompose-agent/index.ts` exports
`decomposeTask(taskId): Promise<ActionResult<DecomposeResult>>`:

1. `const task = tasksService.getTask(taskId)` (the minimal getter Phase 5
   introduces; if Phase 6 is built before Phase 5, add the same
   `findById`-wrapping getter). If absent → `{ ok: false, error: "Task not found" }`.
2. `generateObject({ model: getDecomposeModel(), system: DECOMPOSE_SYSTEM_PROMPT,
   schema: decomposeSchema, prompt: <task title + description> })`.
3. Return `{ ok: true, data: { subtasks: object.subtasks, reasoning: object.reasoning } }`.
   On a thrown LLM/parse error → log + `{ ok: false, error: "The decomposition
   agent failed. Try again." }`.

The use-case **reads** the task and **writes nothing** — generation is read-only,
exactly like the Phase 5 prioritization agent.

**Schema** (`use-cases/decompose-agent/schema.ts`):

```ts
export const decomposeSchema = z.object({
  subtasks: z
    .array(z.object({ title: z.string().trim().min(1).max(200) }))
    .max(12),
  reasoning: z.string().trim().min(1),
});
```

`reasoning` is always present; `subtasks: []` is the "too vague" signal. The
12-item cap is a runaway guard.

**System prompt** (`use-cases/decompose-agent/system-prompt.ts`) — exact wording
written and iterated during implementation (per the ROADMAP). The spec fixes only
what it must convey:

- **Role & goal:** "You are an experienced team lead. Break the given task into a
  small, ordered set of concrete subtasks that can be executed one after another."
- **App context:** DevLog tasks have a title + description; subtasks are a single
  level, just a title, done in order.
- **Quality bar:** subtasks are concrete, non-overlapping, ordered by execution;
  prefer few meaningful steps over many trivial ones; no filler.
- **Refusal rule:** if the title + description are too vague/ambiguous to produce
  meaningful subtasks, return **`subtasks: []`** and put a short, specific reason
  in `reasoning` (what is missing — a clearer goal, scope, or acceptance
  criteria). Never invent a decomposition for an empty/one-word task.

## 3. Types & infra

- `shared/types/decompose.ts` — used by the use-case, action, hook, and
  components, so it lives in `shared/types`:
  ```ts
  export interface SubtaskDraft { readonly title: string }
  export interface DecomposeResult {
    readonly subtasks: SubtaskDraft[];
    readonly reasoning: string;
  }
  ```
- `shared/infra/llm.ts` — add `getDecomposeModel()`, mirroring `getChatModel()`:
  real `anthropic(process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5")`; under
  `MOCK_LLM === "1"` a `MockLanguageModelV2` whose `doGenerate` returns the JSON
  object as text (see §6).

## 4. Save path — bulk persist (the one and only write)

- `shared/repositories/subtasks-repository.ts` — add
  `createMany(rows: NewSubtask[]): Subtask[]` (single `insert(...).values(rows)
  .returning().all()`).
- `services/subtasks-service.ts` — add `createSubtasks(taskId, titles: string[]):
  Subtask[]`: computes the base position once (`(getMaxPosition(taskId) ?? -1) +
  1`) and appends the titles in order **after** existing subtasks. Empty/whitespace
  titles are dropped.
- `app/actions/subtasks.ts` — add `createSubtasksAction({ taskId, titles })`
  (controller; zod: `taskId` uuid, `titles` non-empty array of trimmed 1–200
  strings).
- `shared/hooks/use-create-subtasks-mutation.ts` — `useMutation` →
  `createSubtasksAction`; on success invalidates `subtasksKey(taskId)` so the real
  list re-fetches and shows the new rows.

## 5. Architecture, files & data flow

```
use-cases/decompose-agent/
  schema.ts           decomposeSchema (zod structured-output contract) — §2
  system-prompt.ts    DECOMPOSE_SYSTEM_PROMPT (team-lead persona) — §2
  index.ts            decomposeTask(taskId): ActionResult<DecomposeResult> — §2
use-cases/__tests__/
  decompose-agent.test.ts          integration test (temp SQLite + mock) — §7

shared/types/decompose.ts          SubtaskDraft, DecomposeResult — §3
shared/infra/llm.ts                + getDecomposeModel() (+ MOCK_LLM branch) — §6
services/tasks-service.ts          getTask(id) (reuse Phase 5's; add if absent) — §2
services/subtasks-service.ts       + createSubtasks(taskId, titles[]) — §4
shared/repositories/subtasks-repository.ts  + createMany(rows) — §4

app/actions/decompose.ts           decomposeTaskAction(taskId) (controller) — §2
app/actions/subtasks.ts            + createSubtasksAction({taskId, titles}) — §4
shared/hooks/use-decompose-task.ts          useMutation → decomposeTaskAction
shared/hooks/use-create-subtasks-mutation.ts  useMutation → createSubtasksAction — §4

shared/ui/alert.tsx                shadcn `alert` (install via CLI) — §6
components/subtask-section.tsx     + Decompose button in header; owns draft state — §6
components/decompose-preview.tsx   editable draft rows + Alert + Save/Discard — §6
```

**Draft lifecycle (the heart of the phase):**

```
[Decompose] ── read-only ──> agent returns JSON ──> React state (drafts)
                                                          │
                                  user renames / removes rows (in memory only)
                                                          │
                        ┌─────────────────────────────────┴──────────────────┐
                    [Save N]                                            [Discard] / close modal
                        │                                                     │
            createSubtasksAction → createSubtasks                   state cleared, 0 DB writes
            → repository.createMany   (the ONLY DB write)
                        │
            invalidate subtasksKey → real list re-fetches with the new rows
```

1. **Generate (read-only).** `use-decompose-task` mutation → `decomposeTaskAction`
   → `decomposeTask` reads `title + description`, calls `generateObject`, returns
   `DecomposeResult`. No subtask rows created.
2. **Draft in state.** The returned `subtasks` become local `SubtaskSection` state
   (`DraftRow = { key; title }`, where `key` is a client-only React key with no
   relation to any DB id). Rename/remove mutate only this array.
3. **Save (one write).** Click **Save N** → `use-create-subtasks-mutation` →
   `createSubtasksAction({ taskId, titles })` → `subtasksService.createSubtasks` →
   `repository.createMany`. The drafts become real rows appended at the end. The
   subtasks query is invalidated; the draft state is cleared.
4. **Discard / close (no write).** Drafts are dropped from state; the DB was never
   touched.

## 6. UI & MOCK_LLM

**UI.**
- `shared/ui/alert.tsx` — **install shadcn `alert`** via the shadcn CLI (only
  `alert-dialog` exists today). Variants used: `default` (info, success summary)
  and `destructive` (vague refusal + call-failed).
- `components/subtask-section.tsx` — add the **✨ Decompose** button to the section
  header (beside the "Subtasks" heading). Own the transient decomposition state:
  `status: "idle" | "loading" | "preview" | "refused" | "error"`, the draft rows,
  and `reasoning`. Render `<DecomposePreview>` above the existing subtask list when
  `status !== "idle"`.
- `components/decompose-preview.tsx` — presentational: the Alert (`default` for
  preview, `destructive` for refused/error) carrying `reasoning`, the editable
  draft rows (`Input` + remove `Button`), and the **Save N / Discard** bar. Save is
  disabled when 0 non-empty rows remain. Reused-from-`shared/ui` primitives only.
- **Test ids:** `decompose-button`, `decompose-preview`, `decompose-alert`,
  `decompose-draft-row`, `decompose-draft-input`, `decompose-draft-remove`,
  `decompose-save`, `decompose-discard`, `decompose-dismiss`.
- The button + preview live in `components/` (not a `_components/` folder): the
  task modal is an intercepting route with a full-page fallback, i.e. two
  consumers, per the component-placement rule.

**MOCK_LLM.** `getDecomposeModel()` under `MOCK_LLM === "1"` returns a
`MockLanguageModelV2` whose `doGenerate` emits the structured object as text,
branching on the prompt so e2e is deterministic:

- prompt contains `vague` (case-insensitive) → `{ subtasks: [], reasoning: "The
  task is too vague to break down — add a clearer goal, scope, or acceptance
  criteria." }`.
- otherwise → a fixed ordered list, e.g.
  `{ subtasks: [{title:"Plan the approach"},{title:"Implement the core"},
  {title:"Write tests"}], reasoning: "Split into plan, build, and verify steps." }`.

This drives both UI paths (preview / refusal) offline without a real key.

## 7. Testing & Verification

### E2E tests (Playwright) — core scenarios

`e2e/decompose.spec.ts`, dev server with `MOCK_LLM=1` (reuses the isolated `.e2e`
DB + helpers from the earlier phases; create/open a task via the existing UI
helper pattern).

- **Decompose → edit → Save → persist (main happy path):** create a task with a
  clear title (no "vague") → open the modal → click **Decompose** → the spinner
  shows, then the reasoning Alert and the draft rows appear → rename one draft row,
  remove another → click **Save** → reload → the remaining (edited) titles are now
  real subtasks in order, and the removed one is absent. (Exercises button →
  action → agent → draft state → edit/remove → bulk Save → invalidate → persist.)
- **Vague task → refusal, nothing saved:** create a task whose title contains
  `vague` → open modal → click **Decompose** → a warning Alert with the reasoning
  appears, with **no** draft rows and **no** Save button → reload → the task has no
  subtasks. (Exercises the empty-list refusal path and proves no DB write.)
- **Discard drops the draft (no write):** clear task → **Decompose** → draft rows
  appear → click **Discard** → the preview disappears and the subtask list is
  unchanged → reload → still no subtasks. (Proves drafts are transient.)

### Static checks (always)

- `npm run typecheck` — passes with 0 errors
- `npm run lint` — passes (Biome + the TS-directive guard)
- `npm run build` — builds successfully

### Unit/integration tests (Vitest)

`use-cases/__tests__/decompose-agent.test.ts` (temp SQLite + `getDecomposeModel`
mock), one test with two cases — the agent contract the e2e flow can't assert
directly:

- **clear task** → `result.ok === true`, `result.data.subtasks.length >= 1`,
  `reasoning` non-empty.
- **vague task** (title contains `vague`) → `result.ok === true`,
  `result.data.subtasks` is empty, `reasoning` non-empty.

No per-tool/per-branch sprawl: the Save path is plain CRUD covered by the e2e
happy path, and `tasksService`/`subtasksService` internals are covered by earlier
phases.

### Viewport screenshots

- Dev server with `MOCK_LLM=1`, open a task and trigger Decompose, then:
  `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000/tasks/<id>`
- Read the PNGs: at 1440×900 the Decompose button sits cleanly in the subtask
  header and the preview block (Alert + editable rows + Save/Discard) fits the
  modal without overflow; at 375×812 the rows and action bar wrap without clipping.

### Skipped categories

- **API smoke (curl):** skipped — both paths are Server Actions (no REST route);
  the e2e scenarios drive them end-to-end.
- **DB checks:** the "persisted after Save" and "nothing saved on refusal/discard"
  assertions are done through the UI via reload in the e2e scenarios, which is
  sufficient; no separate DB inspection needed.

### What this covers

Verifies ROADMAP Phase 6 end-to-end: the Decompose button → single-shot agent →
editable client-side draft → Save-only persistence, plus the vague-task refusal
and the transient-draft (Discard / no silent write) guarantees. The integration
test pins the agent's structured contract offline; the e2e scenarios pin the full
user flow and the draft-never-hits-DB-until-Save invariant.

## 8. Out of scope (later phases)

- **Clarifying-question dialogue.** The vague path returns a one-shot explanation,
  not a back-and-forth. The ROADMAP line "Vague-task path: agent asks a clarifying
  question before generating" is reworded to "Vague-task path: agent returns an
  explanation of why it can't decompose, shown in an Alert (no subtasks created)."
- **Dedup against existing subtasks.** The agent sees only title + description, not
  the task's current subtasks; Save always appends.
- **Persisting drafts** across modal close/reload (no `localStorage`).
- Status-update generation (Phase 7). Re-ranking or nesting subtasks.
