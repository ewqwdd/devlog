---
name: writing-verification-plan
description: Use when writing a design spec (during brainstorming, before the spec doc is committed) - defines the MANDATORY "Testing & Verification" section of the spec with a small, focused set of runnable checks. Prioritizes 2-3 core e2e scenarios (Playwright) that exercise the whole roadmap stage front-to-back, plus the always-on static checks (typecheck, lint, build). Avoids exhaustive per-function testing.
---

# Writing a Verification Plan

Every spec MUST contain a `## Testing & Verification` section. A spec without one is incomplete and must not be committed. The goal: a small, high-leverage checklist — static checks plus a couple of core e2e scenarios that drive the whole stage front-to-back — ready to run the moment implementation is done.

**Few broad tests, not many narrow ones.** Two e2e tests that exercise a large slice of the feature are worth more than a hundred unit tests checking individual functions. You are verifying that the **roadmap stage works as a whole**, not that every internal aspect works in isolation.

<HARD-GATE>
Do NOT mark the spec as ready, and do NOT pass it to user review, until the Testing & Verification section exists and meets the rules below.
</HARD-GATE>

## Rules

1. **Concrete, not aspirational.** Every item is either a runnable command or a named test case with an expected outcome. "Add e2e tests" is NOT a plan. "`e2e/subtasks.spec.ts`: add a subtask, complete it, reload — it stays completed" IS.
2. **E2E first, few and broad.** Pick the 2-3 scenarios that cover the most of the stage end-to-end. An e2e test that drives the real UI against the real backend verifies more in one case than a dozen isolated unit tests. Do NOT write a check per function, per branch, or per requirement.
3. **Test the stage, not each aspect.** Verify that the roadmap stage as a whole behaves correctly through a real user flow. Resist the urge to enumerate every small piece — coverage of the happy path plus one or two important edge cases is enough.
4. **Static checks always run.** Typecheck, lint, and build are non-negotiable and apply to every stage.
5. **Unit tests only where they earn it.** Reserve Vitest for genuinely tricky pure logic that is painful or impossible to cover through e2e — a non-trivial algorithm, a tricky reducer, gnarly edge/error branches. Skip unit tests for plain CRUD and glue code that the e2e flow already exercises.
6. **Run immediately after implementation.** The plan is executed right after the feature is built, before claiming completion (see verification-before-completion skill).

## Category Table

E2E is the default. The rest are supporting, used only when they add coverage the e2e flow can't.

| Category | When required | Example checks |
|----------|---------------|----------------|
| **E2E (Playwright)** | PRIMARY — almost always, for any user-facing stage | 2-3 core scenarios: real user steps → expected visible result, front-to-back |
| **Static checks** | ALWAYS | `npx tsc --noEmit`, `npx biome check .`, `npm run build` |
| **Unit (Vitest)** | Only for tricky pure logic not reachably covered by e2e | A few cases on the hard algorithm/edge branches — not every function |
| **Viewport screenshots** | Visual/layout change worth eyeballing | `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs <urls>` — captures at 375×812 (mobile) and 1440×900 (desktop); then Read the PNGs and check nothing is broken/overflowing |
| **API smoke (curl)** | Backend-only stage with no UI to drive via e2e | One happy path + one invalid-input case: command + expected status/shape |
| **DB checks** | When persisted state needs inspecting after the e2e/smoke run | What rows/state to verify |

## Section Template

Add this to the spec, filled in. Keep it short — the e2e block is the heart of it:

```markdown
## Testing & Verification

### E2E tests (Playwright) — core scenarios
- `e2e/<flow>.spec.ts`
  - <scenario 1>: <user steps → expected visible result> (the main happy path through the stage)
  - <scenario 2>: <important edge case → expected result>

### Static checks (always)
- `npx tsc --noEmit` — passes with 0 errors
- `npx biome check .` — passes
- `npm run build` — builds successfully

### Unit tests (Vitest) — only if needed
- `services/<x>/<x>.service.test.ts`
  - <case>: <tricky input → expected outcome>   ← only for hard logic e2e can't reach
- (or) Skipped — the e2e flow covers the logic; no isolated unit tests warranted.

### Supporting checks (include only what applies)
- Viewport screenshots: `node .claude/skills/writing-verification-plan/scripts/screenshot.mjs <url>` → Read PNGs, layout intact
- API smoke: `curl -X POST .../api/<route> -d '<body>'` → `201` + `<field>`; `<invalid>` → `400`
- DB: after the e2e run, <rows/state to verify>

### What this covers
- One or two lines: which roadmap stage this verifies and the slice the e2e scenarios exercise.
```

Scale to the stage: a backend-only change swaps the e2e block for API smoke; a CSS-only change leans on screenshots. The static checks row is never skipped.

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

- [ ] The plan leads with 2-3 core e2e scenarios that exercise the stage front-to-back (or justifies why e2e doesn't apply)
- [ ] No per-function / per-requirement test sprawl — broad coverage over granular
- [ ] Static checks present (typecheck, lint, build)
- [ ] Unit tests included only where e2e genuinely can't reach the logic
- [ ] Every item is runnable or a named case with an expected outcome
- [ ] Commands match this project's actual scripts (check `package.json` — don't invent script names)
