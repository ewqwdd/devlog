# Phase 4 — Chat Agent: Design Spec

> ROADMAP: Phase 4 — Chat agent

Add the AI chat agent to DevLog: a chat panel pinned to the right of the board
where the user talks to an assistant that has the **same task/subtask
capabilities as the user** (except reordering). The agent runs on the Vercel
AI SDK: `useChat` on the client ↔ a `streamText` Route Handler with the
multi-step tool loop (`@ai-sdk/anthropic`). Tools are thin zod-typed wrappers
over the existing services. The agent answers in **restricted HTML** with
task links in the form `/tasks/:id`; the client sanitizes and renders that
HTML and intercepts internal link clicks so the task modal opens over the
board without losing chat history. The visual target is the claude.ai
interface style: flat assistant text, soft user bubbles, collapsible
tool-call cards, status line ("Thinking…", "Using {tool}…").

## Decisions made during brainstorming

- **Full tool parity: tasks + subtasks.** The user chose to extend the
  ROADMAP's task-only tool list with subtask tools (deviation from ROADMAP
  Phase 4 / DESIGN.md §6.1, which list only task tools). This makes
  **Phase 3 (subtasks service) a hard prerequisite** — implementation cannot
  start before Phase 3 lands.
- **No reorder tools.** Position management (`moveTask` to a specific index,
  `moveSubtask`) is excluded for both tasks and subtasks — order is
  meaningless to the agent. Status changes ARE allowed: `editTask` accepts
  `status` and appends the task to the end of the target column.
- **HTML rendering via DOMPurify + `dangerouslySetInnerHTML`** (user's choice
  over a hand-rolled HTML→React mapper). `dompurify` is an approved new
  dependency. A delegated click handler on the message container intercepts
  internal links (`href` starting with `/`) and routes them through
  `router.push`, so the intercepting-route task modal opens over the board
  and client-held chat history survives.
- **Board refresh per tool result** (user's choice over one refresh at the
  end): the client watches streamed tool parts and invalidates React Query
  caches the moment a mutating tool completes — cards appear on the board
  while the agent is still working.
- **Anthropic-style chat UI (option A)**: chosen over classic messenger
  bubbles in a visual mockup comparison.
- **Model: `claude-opus-4-8` by default**, overridable via `ANTHROPIC_MODEL`
  env var. `MOCK_LLM=1` swaps the provider for a scripted
  `MockLanguageModelV2` (AI SDK test utilities) so dev and tests run offline.
- **Chat history is client-held and lost on reload** — fixed by DESIGN.md §3,
  out of scope here. The panel header carries a small note about it.
- **Desktop-only panel.** The panel renders at ≥1024px (`lg`); below that it
  is hidden and the board keeps its Phase 2 behavior. Responsive chat is out
  of scope for this local tool.
- **Layering:** the agent is a **use-case** (`use-cases/chat-agent/`) because
  it orchestrates two services from different modules (`tasksService` +
  `subtasksService`). The LLM provider/mock factory is **infra**
  (`shared/infra/llm.ts`). The route handler is a thin controller.

## 1. Tool surface

Nine tools, all thin zod-typed wrappers over services (never repositories).
Every `execute` returns the project's `ActionResult` shape —
`{ ok: true, data } | { ok: false, error }` — and **never throws**: service
errors (`TaskNotFoundError`, `SubtaskNotFoundError`, FK violations) are
caught and returned as `{ ok: false, error }` so the agent can tell the user
"task not found" instead of crashing the stream.

| Tool | Input (zod) | Behavior |
|---|---|---|
| `listTasks` | `{ status?, priority?, search? }` — all optional, combined with AND | Lists tasks. `search` is a case-insensitive substring match against `title` OR `description`. No filter → the whole board. Filtering happens in the use-case over `tasksService.listBoard()` — no new repository queries for this board size. |
| `createTask` | `{ title: 1..200, description?: ≤2000 (default ''), status? (default 'todo'), priority? (default 'medium') }` (mirrors `createTaskAction`'s schema) | `tasksService.createTask` — appends to the bottom of its column |
| `editTask` | `{ id: uuid }` + partial `{ title, description, priority, status }`, at least one field | title/description/priority → `tasksService.updateTask`; `status` → `tasksService.moveTask(id, status, <target column length>)` (append to end). Both may apply in one call. |
| `deleteTask` | `{ id: uuid }` | `tasksService.deleteTask` (column renumbered by the service) |
| `listSubtasks` | `{ taskId: uuid }` | `subtasksService.listSubtasks`, position asc |
| `createSubtask` | `{ taskId: uuid, title: 1..200 }` | `subtasksService.createSubtask` — appends at end |
| `editSubtask` | `{ id: uuid }` + partial `{ title, done }`, at least one field | `subtasksService.updateSubtask` |
| `deleteSubtask` | `{ id: uuid }` | `subtasksService.deleteSubtask` |
| `runPrioritization` | `{}` | **Phase 5 stub**: returns `{ ok: true, data: "Prioritization is not available yet." }`. Phase 5 replaces the body with the sub-agent. |

No `getTask` (covered by `listTasks`), no `moveTask`/`moveSubtask`
(reordering excluded by design).

## 2. Backend

### `shared/infra/llm.ts` — infra

`getChatModel(): LanguageModel` — returns `anthropic(process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8")`,
or the scripted mock when `MOCK_LLM=1`. Pure client factory, no business
logic. `.env.example` gains `ANTHROPIC_MODEL` (with the default documented);
`ANTHROPIC_API_KEY` and `MOCK_LLM` are already there since Phase 0.

**Mock behavior** (`MockLanguageModelV2` from `ai/test`, keyed on the last
user message; deterministic, exercises the full multi-step loop offline):

- message starts with `create:` → step 1 emits a `createTask` tool call with
  the remainder as `title`; step 2 (after the tool result is in the prompt)
  emits text containing `<a href="/tasks/{id}">…</a>` with the id extracted
  from the tool result.
- message starts with `error:` → the stream errors (exercises the readable
  error path end-to-end).
- anything else → step 1 calls `listTasks {}`; step 2 emits text with the
  task count.

### `use-cases/chat-agent/` — use-case

- `tools.ts` — the 9 tool definitions (§1).
- `system-prompt.ts` — a single exported constant. Content requirements:
  - App context: DevLog is a kanban task tracker; tasks have title,
    description, status (`todo`/`in-progress`/`done`), priority
    (`low`/`medium`/`high`); tasks have one level of subtasks.
  - Role: task assistant with the same task/subtask capabilities as the
    user; use tools for every read/write, never invent task ids — find them
    via `listTasks`.
  - Output format: **HTML only, no markdown**; allowed tags exactly
    `p, ul, ol, li, strong, em, code, br, a`; when referring to a task the
    agent worked with, link it as `<a href="/tasks/{id}">title</a>`; no
    external links.
- `index.ts` — `streamChat(uiMessages: UIMessage[])`:
  `convertToModelMessages` → `streamText({ model: getChatModel(), system,
  tools, messages, stopWhen: stepCountIs(10) })` → returns the result.
  10 steps is the runaway guard for the multi-step loop.

### `app/api/chat/route.ts` — controller

`POST`: zod-validates the body shape (`{ messages: array }` — structural
validation of UI messages is delegated to `convertToModelMessages`, whose
failure is caught and returned as 400 with the project's
`{ ok: false, error }` JSON shape). Then
`streamChat(messages)` → `result.toUIMessageStreamResponse({ onError })`,
where `onError` logs via pino and returns a readable message (e.g.
`"The assistant failed to respond. Try again."`) instead of the SDK's masked
default — this is what the client renders as the red error line (Phase 8
checkpoint). No business logic in the handler.

**New dependencies:** `ai`, `@ai-sdk/anthropic` (both fixed in the CLAUDE.md
stack), `dompurify` (approved during brainstorming).

## 3. Frontend

`app/page.tsx` becomes a flex row: `<Board />` (`flex-1`) + chat panel
(fixed ~400px, `hidden lg:flex`). All chat components live in
`app/_components/chat/` (single-page consumers, per CLAUDE.md placement).

- **`chat-panel.tsx`** — owns `useChat` (default transport → `/api/chat`).
  Header ("Assistant" + the history-not-saved note), scrollable message list
  (auto-scroll to bottom on new parts), status line, input. Input: auto-grow
  textarea, Enter sends, Shift+Enter newline; while `status` is
  `submitted`/`streaming` the send button becomes a Stop button
  (`stop()`), claude.ai-style. Empty state: a short greeting hint.
- **`chat-message.tsx`** — renders one `UIMessage` by iterating `parts`:
  user text → soft bubble aligned right; assistant text part →
  `<MessageHtml html={part.text} />` (flat, no bubble); `tool-*` parts →
  `<ToolCallCard part={part} />`.
- **`tool-call-card.tsx`** — collapsed by default: tool name + state icon
  (spinner while `input-streaming`/`input-available`, green check on
  `output-available`, red marker on `output-error`). Click toggles an
  expanded body with pretty-printed input and output JSON (claude.ai-style).
  `data-testid` hooks: `tool-card`, `tool-card-toggle`.
- **`message-html.tsx`** — sanitize + render assistant HTML:
  - `DOMPurify.sanitize(html, { ALLOWED_TAGS: [p, ul, ol, li, strong, em,
    code, br, a], ALLOWED_ATTR: [href] })` plus an
    `afterSanitizeAttributes` hook that **removes any `href` not starting
    with `/`** (internal links only).
  - The sanitize step is extracted as a pure helper
    (`sanitize-agent-html.ts` next to the component) so Vitest covers it
    directly.
  - Rendered via `dangerouslySetInnerHTML` with one delegated `onClick`:
    if the click target's closest `<a>` has an internal `href` →
    `preventDefault()` + `router.push(href)`. Clicking a task link opens
    the intercepting-route modal **over the board**; chat state survives.

**Status line** (under the last message; English, like the rest of the UI):
`status === 'submitted'` → *Thinking…*; while streaming and the last
assistant part is a tool part without output → *Using {toolName}…*;
while text is streaming → no status line.

**Board refresh.** An effect in `chat-panel` watches `messages`: when a part
of a mutating tool (`createTask`, `editTask`, `deleteTask`, `createSubtask`,
`editSubtask`, `deleteSubtask`) transitions to `output-available`, it calls
`queryClient.invalidateQueries({ queryKey: ['board'] })` and
`invalidateQueries({ queryKey: ['subtasks'] })`. Implementation detail: keep
a ref of already-seen completed tool part ids so each completion invalidates
exactly once.

**Errors.** `error` from `useChat` renders as a red line in the message list
(readable text from the route's `onError`); the input stays usable so the
user can retry by sending again.

## 4. Testing & Verification

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes (Biome + directive guard)
- `npm run build` — builds successfully

### Unit/integration tests (Vitest)

- `use-cases/__tests__/chat-tools.test.ts` (temp SQLite, same test-DB setup
  as service tests; calls each tool's `execute` directly)
  - listTasks without filter → returns every task
  - listTasks `status` / `priority` filters → only matching tasks
  - listTasks `search` → case-insensitive match in title OR description
    ("AUTH" matches a task with "refactor auth" in the description)
  - listTasks combined filters → AND semantics
  - createTask → row exists, position = max+1 in its column, `{ok: true}`
  - editTask title/priority patch → fields updated, position untouched
  - editTask status change → task is last in the target column; both
    affected columns stay dense `0..n-1`
  - editTask / deleteTask / editSubtask / deleteSubtask with unknown id →
    `{ok: false, error}` (no throw)
  - createSubtask appends; createSubtask with unknown taskId →
    `{ok: false, error}` (mapped FK violation)
  - editSubtask toggles done / renames; deleteSubtask renumbers the tail
  - runPrioritization → `{ok: true, data: "Prioritization is not available yet."}`
  - input schema rejections: createTask with empty title, editTask with no
    patch fields, editSubtask with no patch fields → zod parse fails
- `use-cases/__tests__/chat-agent.test.ts` (temp SQLite + mock model —
  the offline loop checkpoint from ROADMAP)
  - `create: Buy milk` → after the stream finishes, the task exists in the
    DB and the final text contains `/tasks/<that id>`
  - any other message → `listTasks` executed, final text contains the count
  - `error: boom` → the stream surfaces an error (no unhandled rejection)
- `app/_components/chat/__tests__/sanitize-agent-html.test.ts` (jsdom
  environment — DOMPurify needs a DOM)
  - allowed tags pass through unchanged
  - `<script>`, inline `onclick`, `<img onerror>` → stripped
  - external `href` (`https://…`) → href removed; internal `/tasks/x` kept
  - plain text without tags → returned as-is

### E2E tests (Playwright) — `npm run test:e2e`

`e2e/chat.spec.ts`, dev server started with `MOCK_LLM=1` (reuses Phase 2's
isolated `.e2e` DB infra):

- create flow: type `create: Buy milk`, Enter → *Thinking…* appears → a
  `createTask` tool card appears → assistant reply renders → a "Buy milk"
  card is on the board **without reload** (mock analogue of the ROADMAP
  checkpoint)
- tool card expand: click the card → input/result JSON visible
- task link: click the `<a>` in the reply → task modal opens over the board
  (URL is `/tasks/<id>`), and the chat still shows the previous messages
  (history survived the navigation)
- list flow: send `how many tasks?` → `listTasks` tool card + a text reply
- error flow: send `error: boom` → red readable error line appears; sending
  another message afterwards still works
- reload → chat is empty (client-held history, documented behavior)

### Viewport screenshots

- Command (dev server with `MOCK_LLM=1`; first exchange a couple of messages
  incl. a tool card):
  `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000`
- Check: Read each PNG — at 1440×900 the panel sits right of the board, no
  overflow, tool card and input reachable; at 375×812 the panel is hidden
  and the board renders as in Phase 2.

### API smoke (curl) — dev server with `MOCK_LLM=1`

- `curl -N -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"hi"}]}]}'`
  → `200`, streamed UI-message response (data lines with tool/text parts)
- `curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{}'`
  → `400`, body matches `{ "ok": false, "error": … }`

### Manual check with a real key (ROADMAP checkpoint)

- With `ANTHROPIC_API_KEY` set and `MOCK_LLM` off: send
  "create a task to refactor auth, high priority" → a high-priority card
  appears on the board without reload. Run once before closing the phase.

### Skipped categories

- DB checks: skipped — no schema changes; persistence is asserted by the
  tool integration tests and the e2e board assertions.

### Requirement coverage

- Agent has user-parity over tasks + subtasks via tools → §1 table +
  `chat-tools.test.ts` (every tool has cases, incl. error paths)
- No reordering for the agent → no move tools in §1 (design-level; nothing
  to test)
- Status change appends to target column end → editTask status-change test
- listTasks filters (status / priority / search in title+description) →
  the four listTasks test cases
- Multi-step tool loop offline with `MOCK_LLM=1` → `chat-agent.test.ts` +
  all e2e flows run on the mock
- Chat panel pinned right, classic chat layout, claude.ai style → §3 +
  desktop screenshot
- Tool usage visible to the user → tool-card e2e (appear + expand)
- Status line ("Thinking…", "Using {tool}…") → create-flow e2e asserts
  *Thinking…*; status derivation in §3
- Agent answers in HTML with `/tasks/:id` links; client parses HTML →
  sanitize unit tests + task-link e2e
- Sanitization (only allowlisted tags, internal hrefs) →
  `sanitize-agent-html.test.ts`
- Board reflects chat-made changes without reload (per tool result) →
  create-flow e2e board assertion
- LLM failure surfaces a readable chat error (Phase 8 checkpoint, built
  early) → error-flow e2e + mock `error:` branch
- Real-key checkpoint from ROADMAP → manual check section

## Out of scope (later phases)

Real `runPrioritization` sub-agent (Phase 5 — replaces the stub's `execute`).
Decompose button (Phase 6). Status-update generation (Phase 7). Persistent
chat history, multi-session chat — excluded by DESIGN.md. Responsive/mobile
chat panel. Chat-driven reordering of tasks/subtasks — excluded by design.
