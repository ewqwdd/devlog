
<stack>

### Stack — fixed, do not introduce alternatives
- **Framework:** Next.js (App Router) + TypeScript strict.
- **Rendering/data:** RSC + Server Actions by default + React Query on client side where needed.
- **UI:** Tailwind v4 + shadcn/ui.
- **Drag-and-drop:** dnd-kit.
- **DB:** Drizzle ORM + SQLite.
- **Validation:** zod v4.
- **LLM:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) — `streamText`/`generateText`/`generateObject`
  with the multi-step tool loop; `useChat` on the client.
- **Logging:** pino.
- **Tests:** Vitest (unit/integration) + Playwright (e2e).
- **Lint/format:** Biome only (its `useExhaustiveDependencies` / `useHookAtTopLevel` rules cover
  react-hooks). No ESLint in this project.

If a task seems to need a library outside this list, stop and ask before adding it.

</stack>

<commands>

### npm commands
- `npm run dev` — dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — Biome check + banned-directive guard (`scripts/check-ts-directives.mjs`)
- `npm run format` — Biome format (write)
- `npm run db:generate` — generate a Drizzle migration from schema changes
- `npm run db:migrate` — apply migrations (run once before first `npm run dev`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` / `npm run test:watch` — Vitest
- `npm run test:e2e` — Playwright (chromium)

</commands>

<code_guidelines>

### Enforced by tooling — never bypass
Type safety, lint, format, and tests are enforced by `tsconfig` (strict), Biome, and the
pre-completion gate. Do not disable, skip, or work around them. No `@ts-ignore`, `@ts-nocheck`,
or `biome-ignore` without a one-line justification comment.

### Types
- No `any`. Use `unknown` + type guards / narrowing.
- `interface` for object shapes; `type` for unions/intersections; discriminated unions for state;
- Explicit return types on all exported functions.

### Functions & data
- Pure functions by default. Side effects (I/O, DB, network) isolated at boundaries.
- Immutable data: never mutate inputs; use `readonly`, return new objects. No shared mutable state.
- Small functions, one responsibility each.

### Structure & reuse
- DRY by rule-of-three: duplicate until the 3rd occurrence, no premature abstraction. YAGNI.
- Sliced architecture is mandatory. Layers: `controller → use-case → service → repository → infrastructure`.
  - **controller** — HTTP/transport boundary: validates input (zod), maps to/from DTOs, no business logic.
    In this project that means Server Actions and route handlers (`route.ts`) — they ARE the
    controller layer; never put business logic directly in them.
  - **use-case** — orchestration layer. The rule is simple: if a flow needs more than one service
    (often from different modules), put it in a use-case. If one service is enough, the controller
    calls that service directly and no use-case file is created.
  - **service** — business logic of its own module. Talks to storage only through repositories.
  - **repository** — abstraction over data storage. The only layer that knows how data is persisted.
  - **infra** — pure clients (DB connection, Claude API, external HTTP, queues): plain
    classes/objects with no business logic. Consumed by repositories and services, never the reverse.
  - The layer structure is exempt from YAGNI and "no abstractions for single-use code": even for a
    trivial CRUD endpoint, always create the controller, service, and repository. The only optional
    layer is use-case (see its rule above). When architecture and simplicity rules conflict,
    architecture wins.
- Dependencies point downward only; a layer never imports from a layer above it, and never skips
  past repositories to reach infra storage clients directly.
- One module / one responsibility per file.

### Folder structure — where things go
```
app/                    Next.js App Router: pages, layouts, route handlers, Server Actions
app/<page>/_components/ components used ONLY on this page
components/             project-bound components, reusable across pages
use-cases/              use-case layer
services/               service layer
shared/ui/              pure UI components, portable to any project
shared/repositories/    repository layer
shared/infra/           infra clients (DB connection, Claude API, ...)
shared/lib/             helpers: formatting, logger setup, etc.
shared/types/           types reused in more than one place
```
- **`shared/ui/`** — reusable UI components not tied to any feature (e.g. `Input`, `Button`).
  Litmus test: the component could be copied into another project and work as-is. If it imports
  anything project-specific (types, services, other components), it does NOT belong here.
  shadcn/ui components live here.
- **`components/`** — components tied to this project's domain but free to use on any page
  (e.g. `TaskCard` — pure display of a task, works on the board and in a plain task list).
  They can't be moved to another project, but inside this one they are shared building blocks.
- **`app/<page>/_components/`** — components that belong to one page only. They exist for
  decomposition (instead of writing everything in `page.tsx`) and are never imported by another
  page. Keep these to a minimum: with good decomposition the ready-made blocks live in
  `components/` and `shared/ui/`, and page components just assemble those blocks and wire page
  logic to them.
- Picking where a component goes: portable to another project as-is → `shared/ui/`;
  project-specific but useful on more than one page → `components/`; tied to a single page →
  `app/<page>/_components/`.
- **`shared/types/`** — only types used in more than one place. A type used in a single file
  stays next to its usage.
- The moment a type is needed in a second place, move it to `shared/types/` and import it from
  there — never duplicate the type and never import it from another module's internal file.
  Before declaring a new type, check `shared/types/` first: if a fitting type already exists,
  reuse it instead of redefining it.

### Docs & UI components — strict, no deviations
- Use context7 sparingly. Fetch docs only when ALL of the following hold: the logic is critical
  (data integrity, payments, auth, irreversible operations), the use case is non-trivial (not a
  basic/common API usage), and you are genuinely unsure how the library works and clearly need
  documentation. Otherwise rely on existing knowledge and the codebase's established patterns.
- context7 is used via its HTTP API (no MCP server). API key is in `$env:CONTEXT7_API_KEY`.
  - Search for a library id:
    `curl.exe -s -H "Authorization: Bearer $env:CONTEXT7_API_KEY" "https://context7.com/api/v1/search?query=<query>"`
  - Fetch docs (id comes from search results, keep leading slash off the path segment):
    `curl.exe -s -H "Authorization: Bearer $env:CONTEXT7_API_KEY" "https://context7.com/api/v1/<library-id>?type=txt&topic=<topic>&tokens=2000"`
- Frontend styling is Tailwind only.
- Before creating any new UI component in `shared/ui/` you MUST first check whether shadcn/ui
  already has it; if it does, install it via the shadcn CLI instead of writing it yourself.

### Modals
- All modal windows are implemented via Next.js intercepting routes: a parallel route slot
  (e.g. `app/@modal`) plus an intercepted segment (`(.)<route>`), with a full standalone page
  at the real route as fallback. A modal opens via navigation, has its own URL, and survives
  refresh/direct link. No state-only modals (`useState` + conditional render) for anything
  that represents a route-worthy view.

### Errors & boundaries
- Validate all external input at the boundary with a schema (zod) before business logic.
- Throw only `Error` subclasses, never strings/objects. One consistent error shape in API responses.
- async/await only, no callbacks. `return await` when returning a promise.
- Structured logger (pino, see `shared/lib/logger.ts`), never `console.log`.

### Naming & files
- Variables/functions: camelCase. Types/interfaces/components: PascalCase. Constants: UPPER_SNAKE_CASE.
- Booleans: `is`/`has`/`should`/`can` prefix. Functions start with a verb. No abbreviations.

</code_guidelines>

<behavioral_guidelines>
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

2. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

3. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

</behavioral_guidelines>


### Project docs
- Development roadmap: `docs/ROADMAP.md`