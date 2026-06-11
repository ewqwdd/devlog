# Phase 0 — Project Scaffold: Design Spec

> ROADMAP: Phase 0 — Project scaffold

Initialize the DevLog project: Next.js (latest) + Tailwind v4 + shadcn/ui via the
given preset, strict TypeScript, strict Biome lint, Vitest + Playwright wired into
scripts, pino logger, folder skeleton, `.env.example`, and the CLAUDE.md update
required by the roadmap. No product features — the deliverable is a green, empty
project where every quality gate already runs.

## Decisions made during brainstorming

- **Dependencies: Phase 0 only.** Drizzle, zod, AI SDK, React Query, dnd-kit are
  NOT installed now; each arrives in its own phase (YAGNI).
- **Scaffold via the shadcn template** (one command, preset is mandatory), not
  `create-next-app` + separate init.
- **Next.js must be the latest published version** — forced after scaffold if the
  template pins an older one.
- **Return types: `nursery/useExplicitReturnType` as `error` for ALL functions**
  (stricter than CLAUDE.md's "exported only"; Biome has no boundaries-only mode).
  Accepted deliberately — no second linter.
- **No ESLint.** Everything requested is available in Biome ≥ 2.4.11. The single
  gap (`@ts-nocheck` is not covered by `noTsIgnore`) is closed by a grep step in
  the `lint` script.

## 1. Scaffold

1. Run `npx shadcn@latest init --preset b68IyobssS --template next --pointer`.
   The repo root is non-empty (`.claude/`, `docs/`, `CLAUDE.md`, `.gitattributes`),
   so the CLI scaffolds into a subdirectory; move ALL generated files (including
   dotfiles: `.gitignore`, etc.) into the repo root, then remove the empty
   subdirectory. Existing root files are untouched; no name collisions expected.
2. Force latest Next: `npm install next@latest react@latest react-dom@latest`.
   Verify with `npx next --version` against `npm view next version`.
3. Smoke: `npm run dev` serves the template page; `npm run build` succeeds.

The preset's artifacts (`components.json`, global CSS with Tailwind v4, any
preset-installed components under its configured alias) are kept exactly as the
preset generates them.

## 2. Strict TypeScript

`tsconfig.json` keeps the template's Next.js settings and adds:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true
  }
}
```

If template starter files fail under these flags, fix the files — never relax the
config.

## 3. Biome — strict lint + format

Install `@biomejs/biome` (latest; must be ≥ 2.4.11 for `useExplicitReturnType`).
`biome.json`:

- `recommended: true` rules, formatter enabled (replaces Prettier), assist
  actions on (import sorting).
- Domains: `react: "recommended"`, `next: "recommended"` (provides
  `useExhaustiveDependencies`, `useHookAtTopLevel`, Next-specific rules),
  `project: "recommended"` (cross-file type inference for promise rules).
- Rule overrides, all `error`:
  - `suspicious/noExplicitAny`
  - `suspicious/noTsIgnore` (bans `@ts-ignore`; `@ts-expect-error` remains
    allowed and self-checks)
  - `nursery/noFloatingPromises` (type-aware)
  - `nursery/noMisusedPromises` (type-aware)
  - `nursery/useExplicitReturnType` (all functions — accepted decision)
- Suppressions use Biome's `// biome-ignore lint/<rule>: <reason>` format; the
  reason is syntactically required, satisfying "no suppression without
  justification".

**Known gaps (declared):**

1. `@ts-nocheck` is not caught by `noTsIgnore` → covered by a grep step inside
   `npm run lint` that fails when `@ts-nocheck` (or `@ts-ignore`, as
   belt-and-braces) appears in source dirs.
2. No "exported functions only" mode for return types → rule applies to all
   functions (decision above).

## 4. Tests

- **Vitest**: `vitest` (+ `@vitejs/plugin-react` for later component tests),
  `vitest.config.ts`, environment `node` (jsdom deferred until component tests
  exist). One real test now: `shared/lib/logger.test.ts` (see §7 for cases).
- **Playwright**: `@playwright/test`, chromium only
  (`npx playwright install chromium`), `playwright.config.ts` with `webServer`
  auto-starting the dev server. One smoke spec: `e2e/smoke.spec.ts` (see §7).
  `e2e/` directory excluded from Vitest's include glob.

## 5. Logger, folder skeleton, .env.example

- **pino** in `shared/lib/logger.ts`: exported singleton; level from
  `LOG_LEVEL` env (default `info`); `pino-pretty` as a devDependency, enabled
  only in development.
- **Folder skeleton** per CLAUDE.md: `app/`, `components/`, `services/`,
  `use-cases/`, `shared/ui/`, `shared/repositories/`, `shared/infra/`,
  `shared/lib/`, `shared/types/`. Empty dirs get `.gitkeep`.
- **`.env.example`**: `ANTHROPIC_API_KEY=`, `MOCK_LLM=1`, `LOG_LEVEL=info`.
  `.env` stays in `.gitignore`. `.superpowers/` added to `.gitignore`
  (screenshot output).

## 6. npm scripts + CLAUDE.md update

Scripts in `package.json`:

| script | command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `biome check .` + grep step for `@ts-nocheck`/`@ts-ignore` in source dirs |
| `format` | `biome format --write .` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `playwright test` |

After implementation (roadmap requirement):

- Update `CLAUDE.md`: add the npm commands above; in the line
  "- Structured logger (pino), never `console.log`." add a direct link to
  `shared/lib/logger.ts`.
- Check off Phase 0 in `docs/ROADMAP.md`.

## 7. Testing & Verification

### Static checks (always)

- `npm run typecheck` — 0 errors
- `npm run lint` — passes (Biome + grep step)
- `npm run build` — builds successfully

### Config tripwires (prove strictness actually fires)

Run each with a temporary scratch file `services/_tripwire.ts`, expect FAILURE,
then delete the file:

- `const x: any = 1` → `npm run lint` fails with `suspicious/noExplicitAny`
- `export function f() { return 1 }` (no return type) → `npm run lint` fails
  with `nursery/useExplicitReturnType`
- `async function g(): Promise<void> {}; g()` (un-awaited) → `npm run lint`
  fails with `nursery/noFloatingPromises`
- `// @ts-nocheck` at top of file → `npm run lint` fails (grep step)
- `declare const o: Record<string, string>; const v: string = o["k"]` →
  `npm run typecheck` fails (`noUncheckedIndexedAccess`)

### Unit/integration tests (Vitest)

- `shared/lib/logger.test.ts`
  - default level: with `LOG_LEVEL` unset, `logger.level === "info"`
  - env override: with `LOG_LEVEL=debug`, `logger.level === "debug"`
  - it logs: a `logger.info(...)` call produces a record on an injected
    destination stream containing the message

### E2E tests (Playwright)

- `e2e/smoke.spec.ts`
  - home page loads: navigate to `/` → response OK, `<body>` visible and
    non-empty (automates the roadmap checkpoint "dev serves an empty page")

### Viewport screenshots

- Command: `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000`
  (dev server running; output `.superpowers/screenshots/`)
- Pages: `/` (template start page)
- Check: Read both PNGs (375×812, 1440×900) — page renders, no broken layout

### Environment checks (scaffold-specific)

- `npx next --version` equals `npm view next version` (latest Next — hard
  requirement)
- `npx @biomejs/biome --version` ≥ 2.4.11
- `components.json` exists in repo root (preset applied)
- Fresh-clone check: `git clean -xdn` shows only ignored artifacts; then
  `npm install && npm run dev` serves the page (roadmap checkpoint)

### API smoke (curl)

- Skipped — no route handlers or Server Actions in Phase 0.

### DB checks

- Skipped — no database until Phase 1.

### Requirement coverage

- Project initialized, runs and builds → Static checks; E2E smoke; fresh-clone
  check
- shadcn connected with preset `b68IyobssS` → `components.json` check; build
  passes with preset artifacts
- Tailwind v4 connected → build passes; screenshot of `/` shows styled template
  page
- Latest Next.js → `next --version` vs `npm view next version`
- Strict tsconfig flags → `noUncheckedIndexedAccess` tripwire; typecheck passes
  on real code
- Strict Biome (noExplicitAny, noTsIgnore, return types, type-aware promise
  rules) → config tripwires; lint passes on real code
- `@ts-nocheck` ban (Biome gap) → grep-step tripwire
- Vitest wired → logger tests pass via `npm run test`
- Playwright wired → smoke spec passes via `npm run test:e2e`
- pino logger in `shared/lib/` → logger unit tests
- Folder skeleton → fresh-clone check (dirs present in git via `.gitkeep`)
- `.env.example` with `ANTHROPIC_API_KEY`, `MOCK_LLM` → fresh-clone check (file
  tracked in git)
- CLAUDE.md updated with commands + logger link; ROADMAP Phase 0 checked →
  manual review of the diff at completion
