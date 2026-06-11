---
name: writing-verification-plan
description: Use when writing a design spec (during brainstorming, before the spec doc is committed) - defines the MANDATORY "Testing & Verification" section of the spec with concrete, runnable checks (typecheck, lint, build, Vitest, Playwright e2e, viewport screenshots, curl smoke tests) so the feature can be verified immediately after implementation.
---

# Writing a Verification Plan

Every spec MUST contain a `## Testing & Verification` section. A spec without one is incomplete and must not be committed. The goal: the moment implementation is done, there is a ready-made, concrete checklist to run — no inventing tests after the fact.

<HARD-GATE>
Do NOT mark the spec as ready, and do NOT pass it to user review, until the Testing & Verification section exists and meets the rules below.
</HARD-GATE>

## Rules

1. **Concrete, not aspirational.** Every item is either a runnable command or a named test case with an expected outcome. "Add tests for the service" is NOT a plan. "`task.service.test.ts`: returns 404 error for unknown task id" IS.
2. **Tests are written during implementation, not after.** The cases listed here become the TDD targets: the implementer writes them first and makes them pass (see test-driven-development skill).
3. **Every requirement maps to at least one check.** If a requirement in the spec has no corresponding verification item, either add the check or question the requirement.
4. **Skipped categories must be declared.** If a category from the table below doesn't apply, write it down with one line of justification (e.g. "E2E: skipped — no UI changes"). Silence is not allowed.
5. **Run immediately after implementation.** The full plan is executed right after the feature is built, before claiming completion (see verification-before-completion skill).

## Category Table

Pick required categories by feature type:

| Category | When required | Example checks |
|----------|---------------|----------------|
| **Static checks** | ALWAYS | `npx tsc --noEmit`, `npx biome check .`, `npm run build` |
| **Unit/integration (Vitest)** | Any business logic: services, use-cases, repositories, helpers | Named test cases per function/branch, incl. error paths |
| **E2E (Playwright)** | Any user-facing flow changed or added | Scenario: steps + expected visible result |
| **Viewport screenshots** | Any visual/layout change | `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs <urls>` — captures affected pages at 375×812 (mobile) and 1440×900 (desktop); then Read the PNGs and check nothing is broken/overflowing |
| **API smoke (curl)** | Any new/changed route handler or Server Action endpoint | `curl` command + expected status and response shape, incl. one invalid-input case |
| **DB checks** | Any schema or query change | What rows/state to inspect after the e2e/smoke run |

## Section Template

Add this to the spec, filled in:

```markdown
## Testing & Verification

### Static checks (always)
- `npx tsc --noEmit` — passes with 0 errors
- `npx biome check .` — passes
- `npm run build` — builds successfully

### Unit/integration tests (Vitest)
- `services/<x>/<x>.service.test.ts`
  - <case name>: <input → expected outcome>
  - <error case>: <invalid input → expected error>

### E2E tests (Playwright)
- `e2e/<flow>.spec.ts`
  - <scenario>: <user steps → expected visible result>

### Viewport screenshots
- Command: `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs <url> [url...]`
  (defaults: viewports 375×812 + 1440×900, full page, output to `.superpowers/screenshots/`)
- Pages: <affected pages/urls>
- Check: Read each PNG — layout intact, no overflow/overlap, interactive elements reachable

### API smoke (curl)
- `curl -X POST .../api/<route> -d '<body>'` → expect `201`, body contains `<field>`
- `curl -X POST .../api/<route> -d '<invalid body>'` → expect `400`, error shape

### Skipped categories
- <category>: skipped — <one-line justification>

### Requirement coverage
- <requirement 1> → <check(s) above>
- <requirement 2> → <check(s) above>
```

Scale the section to the feature: a backend-only change may legitimately skip e2e and screenshots; a CSS-only change may skip Vitest. The static checks row is never skipped.

## Screenshot Script

`scripts/screenshot.mjs` captures full-page screenshots of URLs at mobile + desktop viewports:

```bash
node .claude/skills/writing-verification-plan/scripts/screenshot.mjs \
  http://localhost:3000 http://localhost:3000/tasks \
  [--out dir] [--viewports 375x812,1440x900] [--wait ms] [--no-full-page]
```

- Requires Playwright in the project under test (`playwright`, `@playwright/test`, or `playwright-core` — resolved from cwd) and an installed Chromium (`npx playwright install chromium`).
- The dev server must be running before capturing (`npm run dev`, then screenshot `http://localhost:3000/...`).
- After capturing, Read each PNG and visually verify the layout — taking screenshots without looking at them is not verification.
- Output dir `.superpowers/screenshots/` should be in `.gitignore`.

## Self-Check Before Finishing

- [ ] Every item is runnable or a named case with expected outcome
- [ ] Every spec requirement appears in Requirement coverage
- [ ] Skipped categories are listed with justification
- [ ] Commands match this project's actual scripts (check `package.json` — don't invent script names)
