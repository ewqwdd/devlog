<stack>

### Stack — fixed, do not introduce alternatives
- **Framework:** Next.js (App Router) + TypeScript strict.
- **Rendering/data:** RSC + Server Actions by default + React Query on the client where needed.
- **UI:** Tailwind v4 + shadcn/ui.
- **Drag-and-drop:** dnd-kit.
- **DB:** Drizzle ORM + SQLite.
- **Validation:** zod v4.
- **LLM:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) — `streamText`/`generateText`/`generateObject`
  with the multi-step tool loop; `useChat` on the client.
- **Logging:** pino.
- **Tests:** Vitest (unit/integration) + Playwright (e2e).
- **Lint/format:** Biome only (`useExhaustiveDependencies` / `useHookAtTopLevel` cover react-hooks).
  No ESLint.

If a task seems to need a library outside this list, stop and ask before adding it.

</stack>

<code_guidelines>

### HARD RULE: enforced by tooling — never bypass
Type safety, lint, format, and tests are enforced by `tsconfig` (strict), Biome, and the
pre-completion gate. Never disable, skip, or work around them. No `@ts-ignore`, `@ts-nocheck`,
or `biome-ignore` without a one-line justification comment.

### Types
- No `any`. Use `unknown` + type guards / narrowing.
- `interface` for object shapes; `type` for unions/intersections; discriminated unions for state.
- Explicit return types on all exported functions.

### Functions & data
- Pure functions by default; side effects (I/O, DB, network) isolated at boundaries.
- Immutable: never mutate inputs; use `readonly`, return new objects. No shared mutable state.
- Small functions, one responsibility each.
- async/await only, no callbacks. `return await` when returning a promise.

### HARD RULE: sliced architecture is mandatory
Layers: `controller → use-case → service → repository → infrastructure`.
- **controller** — HTTP/transport boundary: validates input (zod), maps to/from DTOs, no business logic.
    In this project that means Server Actions and route handlers (`route.ts`) — they ARE the
    controller layer; never put business logic directly in them.
- **use-case** — orchestration layer. The rule is simple: if a flow needs more than one service
    (often from different modules), put it in a use-case. If one service is enough, the controller
    calls that service directly and no use-case file is created.
- **service** — business logic of its own module; talks to storage only through repositories.
- **repository** —  abstraction over data storage. the only layer that knows how data is persisted.
- **infra** — pure clients (DB connection, Claude API, external HTTP, queues): no business logic;
  consumed by repositories/services, never the reverse.
- Always create controller, service, and repository even for trivial CRUD (exempt from YAGNI);
  use-case is the only optional layer. When architecture and simplicity conflict, architecture wins.
- Dependencies point downward only: a layer never imports from a layer above it, and never skips
  past repositories to reach infra storage clients directly.
- One module / one responsibility per file. DRY by rule-of-three (duplicate until the 3rd
  occurrence, no premature abstraction); otherwise YAGNI.

### Folder structure — where things go
```
app/                    Next.js App Router: pages, layouts, route handlers, Server Actions
app/<page>/_components/ components used ONLY on that page
components/             project-bound components, reusable across pages
use-cases/              use-case layer
services/               service layer
shared/ui/              pure, portable UI components (shadcn/ui lives here)
shared/repositories/    repository layer
shared/infra/           infra clients (DB connection, Claude API, ...)
shared/lib/             helpers: formatting, logger setup, etc.
shared/hooks/           client React hooks (TanStack Query / API-request hooks)
shared/types/           types reused in more than one place
```
- **`shared/ui/`** — UI not tied to any feature. Litmus: copyable into another project as-is. If it
  imports anything project-specific (types, services, other components), it does NOT belong here.
- **`components/`** — domain components reusable across pages (e.g. `TaskCard`). Not portable to
  another project, but shared building blocks inside this one.
- **`app/<page>/_components/`** — components used by one page only, for decomposition. Keep to a
  minimum: well-decomposed pages assemble ready-made blocks from `components/` and `shared/ui/`.
  `app/_components/` is the home page's (`app/page.tsx`) bucket and nothing else — NOT a catch-all;
  never drop a component there for lack of an obvious home, run the procedure below.

#### HARD RULE: component placement — count consumers, not judgement
Count the pages that import a component across the whole `app/` tree:
1. Reachable from **two or more pages** (now or by design) → `components/`, or `shared/ui/` if
   project-agnostic and portable. NEVER a `_components/` folder.
2. **An intercepting-route modal counts as two consumers** — every modal body has a mandatory
   full-page fallback (see Modals), so it's always rendered on its real page too → `components/`.
   Its private subtree (children it alone pulls in) moves with it.
3. Reachable from **exactly one page**, certain to stay that way → that page's `app/<page>/_components/`.
4. The instant a single-page `_components/` component gains a second consumer, MOVE it to
   `components/` in the same change — never import a `_components/` file across pages, never copy it.
- A `components/` or `shared/ui/` file MUST NOT import from any `app/**/_components/` folder; a
  helper child of a shared component lives in `components/` too.

### Types placement
- `shared/types/` holds only types used in more than one place; a single-file type stays next to its
  usage. The moment a type is needed in a second place, move it there and import from there — never
  duplicate it, never import it from another module's internal file. Check `shared/types/` before
  declaring a new type and reuse a fitting one.

### TanStack Query
- Every TanStack Query call (`useQuery`, `useMutation`, …) MUST be extracted into a dedicated hook
  `shared/hooks/use-<name>.ts` — never inline, never in a `hooks/` folder next to components
  (extract even a single-use query). Any hook that performs an API request, including Server Action
  wrappers, lives in `shared/hooks/` too.
- Hooks own data concerns: query keys, query/mutation functions, optimistic updates, rollback,
  invalidation. Components own UI side effects (toasts, navigation, local state), passed in via the
  hook's callback options.
- A query key is declared once next to its hook and exported from there — never redeclared. One hook
  per query key; check for an existing one before writing a new hook.

### UI components
- Frontend styling is Tailwind only.
- Before creating any new component in `shared/ui/`, check whether shadcn/ui already has it; if so,
  install it via the shadcn CLI instead of writing it yourself.
- Use context7 sparingly — only when ALL hold: the logic is critical (data integrity, payments,
  auth, irreversible ops), the use case is non-trivial, and you are genuinely unsure how the library
  works. Otherwise rely on existing knowledge and codebase patterns.

#### Assemble UI from `shared/ui`, never inline raw primitives
Every UI primitive (button, input, textarea, select, checkbox, dialog, …) comes from `shared/ui/` —
import `Button`/`Input`/`Textarea`/… and tune via props/`className`. Never hand-write a raw
`<button>`/`<input>`/… with inline classes when a `shared/ui` equivalent exists; if a variant is
missing, extend that component, don't reinvent it. Fix such violations when you touch the file.
- Only exception: an element that doesn't correlate with anything in `shared/ui/` and no `className`
  can reach it — e.g. a whole card as one clickable `<button>`. Rare, not the norm.

### Modals
- All modals use Next.js intercepting routes: a parallel slot (`app/@modal`) plus an intercepted
  segment (`(.)<route>`), with a full standalone page at the real route as fallback. A modal opens
  via navigation, has its own URL, and survives refresh/direct link. No state-only modals
  (`useState` + conditional render) for anything route-worthy.

### Errors & boundaries
- Validate all external input at the boundary with a zod schema before business logic.
- Throw only `Error` subclasses, never strings/objects. One consistent error shape in API responses.
- Structured logger (pino, see `shared/lib/logger.ts`), never `console.log`.

### Naming
- Variables/functions camelCase; types/interfaces/components PascalCase; constants UPPER_SNAKE_CASE.
- Booleans: `is`/`has`/`should`/`can` prefix. Functions start with a verb. No abbreviations.

</code_guidelines>

<behavioral_guidelines>
Bias toward caution over speed; for trivial tasks, use judgement.

1. **Simplicity first** — minimum code that solves the problem, nothing speculative. No features
   beyond what was asked, no abstractions for single-use code, no unrequested
   flexibility/configurability, no error handling for impossible scenarios. If 200 lines could be
   50, rewrite it.
2. **Surgical changes** — touch only what you must; match existing style. Don't refactor or
   "improve" adjacent code, comments, or formatting that isn't broken. Remove only the
   imports/variables/functions YOUR changes orphaned; mention pre-existing dead code, don't delete
   it. Every changed line should trace directly to the request.
3. **Goal-driven execution** — turn each task into a verifiable goal ("add validation" → "write
   tests for invalid inputs, then make them pass") and loop until it's met. For multi-step tasks,
   state a brief plan with a verify check per step.

</behavioral_guidelines>

### Project docs
- Development roadmap: `docs/ROADMAP.md`