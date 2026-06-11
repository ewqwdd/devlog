# Phase 0 — Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A green, empty DevLog project: Next.js (latest) + Tailwind v4 + shadcn (preset `b68IyobssS`), strict TypeScript, strict Biome, Vitest + Playwright wired, pino logger, folder skeleton, `.env.example`, CLAUDE.md updated.

**Architecture:** The shadcn template command scaffolds the whole app (Next + Tailwind + preset) into a subdirectory which is then lifted into the repo root. Quality tooling (strict tsconfig, Biome, tests) is layered on top, each layer leaving the project green. No product features.

**Tech Stack:** Next.js (App Router, latest), TypeScript strict, Tailwind v4, shadcn/ui, Biome ≥ 2.4.11, Vitest, Playwright (chromium), pino.

**Spec:** `docs/superpowers/specs/2026-06-11-phase-0-scaffold-design.md`

**Platform note:** Host shell is PowerShell 5.1 (no `&&`). Run chained commands as separate invocations. npm scripts themselves run under cmd.exe, where `&&` is fine.

---

### Task 1: Scaffold via shadcn preset and lift into repo root

**Files:**
- Create: entire Next app (template-generated: `package.json`, `app/`, `components.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, …) — lifted into repo root

- [ ] **Step 1: Run the scaffold command** (preset is mandatory, verbatim)

Run in repo root:
```
npx shadcn@latest init --preset b68IyobssS --template next --pointer
```
When prompted for a project name, answer exactly: `scaffold-tmp`
Expected: CLI creates `scaffold-tmp/` containing a Next.js app with Tailwind v4, `components.json`, and the preset's artifacts.

- [ ] **Step 2: Lift everything into the repo root**

```powershell
Get-ChildItem scaffold-tmp -Force | Move-Item -Destination .
Remove-Item scaffold-tmp
```
If the template created its own `.git` directory inside `scaffold-tmp`, delete it BEFORE moving (`Remove-Item -Recurse -Force scaffold-tmp\.git`) — the repo root already has one. Do not overwrite existing root files (`CLAUDE.md`, `docs/`, `.claude/`, `.gitattributes`) — no collisions are expected; if one occurs, stop and resolve manually.

- [ ] **Step 3: Verify the app is intact**

```
npm install
npm run dev
```
Expected: dev server starts, `http://localhost:3000` renders the template page. Stop the server.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat: scaffold Next.js app via shadcn preset b68IyobssS"
```

---

### Task 2: Force latest Next.js

**Files:**
- Modify: `package.json` (dependency versions)

- [ ] **Step 1: Upgrade**

```
npm install next@latest react@latest react-dom@latest
```

- [ ] **Step 2: Verify latest (hard requirement)**

```
npx next --version
npm view next version
```
Expected: both print the same version.

- [ ] **Step 3: Build + dev smoke**

```
npm run build
```
Expected: build succeeds. If the upgrade broke template code, fix the template code (consult Next.js release notes via context7 if needed).

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "chore: force latest next/react"
```

---

### Task 3: Strict TypeScript

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json` (add `typecheck` script)
- Modify: template `.tsx`/`.ts` files if they fail under the new flags

- [ ] **Step 1: Add strict flags to `tsconfig.json`** (merge into existing `compilerOptions`, keep everything the template set)

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

- [ ] **Step 2: Add the script**

In `package.json` `scripts`:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Run and fix fallout**

```
npm run typecheck
```
Expected: errors are possible in template files (e.g. `process.env.X` property access). Fix the FILES, never the config. Typical fix: `process.env["SOME_VAR"]` instead of `process.env.SOME_VAR` for vars not declared in Next's `ProcessEnv`. Re-run until 0 errors.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat: enable strict TypeScript flags + typecheck script"
```

---

### Task 4: Biome — strict lint + format

**Files:**
- Create: `biome.json`
- Create: `scripts/check-ts-directives.mjs`
- Modify: `package.json` (add `lint`, `format` scripts; devDependency)
- Modify: template files that violate the new rules

- [ ] **Step 1: Install Biome (latest)**

```
npm install -D @biomejs/biome
npx @biomejs/biome --version
```
Expected: version ≥ 2.4.11 (required for `useExplicitReturnType`). If lower, stop — the npm registry should already serve a newer one; investigate.

- [ ] **Step 2: Write `biome.json`**

(Set the `$schema` version segment to the installed version printed above.)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.11/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true },
  "formatter": { "enabled": true, "indentStyle": "space" },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "domains": {
      "react": "recommended",
      "next": "recommended",
      "project": "recommended"
    },
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noTsIgnore": "error"
      },
      "nursery": {
        "noFloatingPromises": "error",
        "noMisusedPromises": "error",
        "useExplicitReturnType": "error"
      }
    }
  }
}
```
If Biome rejects a key (config schema drifts between minors), check the installed version's docs via context7 and adapt the key name — do NOT drop the rule.

- [ ] **Step 3: Write `scripts/check-ts-directives.mjs`** (closes the `@ts-nocheck` gap; no deps)

```js
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIRS = ["app", "components", "services", "use-cases", "shared", "e2e"];
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const BANNED = /@ts-(nocheck|ignore)\b/;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (BANNED.test(line)) offenders.push(`${path}:${index + 1}: ${line.trim()}`);
    });
  }
}

for (const dir of SOURCE_DIRS) {
  try {
    statSync(dir);
  } catch {
    continue;
  }
  walk(dir);
}

if (offenders.length > 0) {
  console.error(`Banned TypeScript directives found:\n${offenders.join("\n")}`);
  process.exit(1);
}
```
(`console.error` is fine here: it is a tooling script outside the app source dirs; the pino rule in CLAUDE.md governs app code.)

- [ ] **Step 4: Add scripts**

In `package.json` `scripts` (replace any template `lint` script):
```json
"lint": "biome check . && node scripts/check-ts-directives.mjs",
"format": "biome format --write ."
```

- [ ] **Step 5: Run and fix fallout**

```
npm run lint
```
Expected violations in template code, typically missing return types. Fix pattern for pages/layouts:

```tsx
export default function Home(): React.JSX.Element {
  // ...template body unchanged
}
```
(`import type React from "react"` if not already in scope.) Apply `npx @biomejs/biome check --write .` first to auto-fix formatting/imports, then fix the rest by hand. Re-run until clean.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat: strict Biome lint + ts-directive guard script"
```

---

### Task 5: Folder skeleton, .env.example, .gitignore

**Files:**
- Create: `components/.gitkeep`, `services/.gitkeep`, `use-cases/.gitkeep`, `shared/ui/.gitkeep`, `shared/repositories/.gitkeep`, `shared/infra/.gitkeep`, `shared/lib/.gitkeep`, `shared/types/.gitkeep`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create the skeleton** (`app/` already exists from the template; if the preset already created some of these dirs with content, skip their `.gitkeep`)

```powershell
"components","services","use-cases","shared/ui","shared/repositories","shared/infra","shared/lib","shared/types" | ForEach-Object { New-Item -ItemType Directory -Force $_ | Out-Null; if (-not (Get-ChildItem $_)) { New-Item -ItemType File "$_/.gitkeep" | Out-Null } }
```

- [ ] **Step 2: Write `.env.example`**

```
ANTHROPIC_API_KEY=
MOCK_LLM=1
LOG_LEVEL=info
```

- [ ] **Step 3: Update `.gitignore`** — ensure these lines exist (template usually has `.env*` already; add what's missing):

```
.env
.superpowers/
```

- [ ] **Step 4: Verify gates still green**

```
npm run lint
npm run typecheck
```
Expected: both pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat: folder skeleton, .env.example, gitignore entries"
```

---

### Task 6: Vitest + pino logger (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `shared/lib/logger.test.ts`
- Create: `shared/lib/logger.ts`
- Modify: `package.json` (deps + `test`, `test:watch` scripts)
- Delete: `shared/lib/.gitkeep` (dir no longer empty)

- [ ] **Step 1: Install**

```
npm install pino
npm install -D vitest pino-pretty
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
```

- [ ] **Step 3: Add scripts**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test `shared/lib/logger.test.ts`** (cases from the spec, verbatim targets)

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createLogger", () => {
  it("defaults to level info when LOG_LEVEL is unset", () => {
    vi.stubEnv("LOG_LEVEL", undefined);
    expect(createLogger().level).toBe("info");
  });

  it("uses LOG_LEVEL from the environment", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    expect(createLogger().level).toBe("debug");
  });

  it("writes log records to the injected destination", async () => {
    const chunks: string[] = [];
    const destination = {
      write(chunk: string): void {
        chunks.push(chunk);
      },
    };
    const log = createLogger(destination);
    log.info("hello from test");
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    expect(chunks.join("")).toContain("hello from test");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```
npm run test
```
Expected: FAIL — cannot resolve `./logger`.

- [ ] **Step 6: Implement `shared/lib/logger.ts`**

```ts
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

export function createLogger(destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level: process.env["LOG_LEVEL"] ?? "info",
  };
  if (destination) {
    return pino(options, destination);
  }
  if (process.env.NODE_ENV === "development") {
    return pino({ ...options, transport: { target: "pino-pretty" } });
  }
  return pino(options);
}

export const logger: Logger = createLogger();
```
Delete `shared/lib/.gitkeep`.

- [ ] **Step 7: Run tests to verify they pass**

```
npm run test
```
Expected: 3 passed.

- [ ] **Step 8: Gates**

```
npm run lint
npm run typecheck
```
Expected: both pass (note: bracket access `process.env["LOG_LEVEL"]` is required by `noPropertyAccessFromIndexSignature`; `NODE_ENV` is a declared property, dot access is fine).

- [ ] **Step 9: Commit**

```
git add -A
git commit -m "feat: vitest setup + pino logger with tests"
```

---

### Task 7: Playwright + smoke e2e

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`
- Modify: `package.json` (`test:e2e` script)

- [ ] **Step 1: Install (chromium only)**

```
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
  },
});
```

- [ ] **Step 3: Write `e2e/smoke.spec.ts`** (spec case: home page loads)

```ts
import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();
});
```

- [ ] **Step 4: Add script**

```json
"test:e2e": "playwright test"
```

- [ ] **Step 5: Run**

```
npm run test:e2e
```
Expected: 1 passed (webServer auto-starts dev).

- [ ] **Step 6: Verify unit tests don't pick up e2e**

```
npm run test
```
Expected: still 3 passed, no Playwright spec collected.

- [ ] **Step 7: Gates + commit**

```
npm run lint
npm run typecheck
git add -A
git commit -m "feat: playwright smoke e2e"
```

---

### Task 8: CLAUDE.md update + ROADMAP checkbox

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ROADMAP.md:10`

- [ ] **Step 1: Add commands to `CLAUDE.md`** — new section after `<stack>` block:

```markdown
<commands>

### npm commands
- `npm run dev` — dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — Biome check + banned-directive guard (`scripts/check-ts-directives.mjs`)
- `npm run format` — Biome format (write)
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` / `npm run test:watch` — Vitest
- `npm run test:e2e` — Playwright (chromium)

</commands>
```

- [ ] **Step 2: Link the logger** — in CLAUDE.md replace the line:

```
- Structured logger (pino), never `console.log`.
```
with:
```
- Structured logger (pino, see `shared/lib/logger.ts`), never `console.log`.
```

- [ ] **Step 3: Check off Phase 0 in `docs/ROADMAP.md`**

Change `- [ ] Phase 0 — Project scaffold` to `- [x] Phase 0 — Project scaffold`.

- [ ] **Step 4: Commit**

```
git add CLAUDE.md docs/ROADMAP.md
git commit -m "docs: record npm commands, logger link, check off Phase 0"
```

---

### Task 9: Run the full verification plan (spec §7)

Execute every check from the spec's Testing & Verification section. All must pass before declaring Phase 0 done.

- [ ] **Step 1: Static checks**

```
npm run typecheck
npm run lint
npm run build
```
Expected: all pass.

- [ ] **Step 2: Config tripwires** — for each, create `services/_tripwire.ts` with the snippet, run the command, EXPECT FAILURE with the named rule, then delete the file:

1. `const x: any = 1;` → `npm run lint` fails: `suspicious/noExplicitAny`
2. `export function f() { return 1; }` → `npm run lint` fails: `nursery/useExplicitReturnType`
3. `async function g(): Promise<void> {}\ng();` → `npm run lint` fails: `nursery/noFloatingPromises`
4. `// @ts-nocheck` (first line) → `npm run lint` fails: check-ts-directives output
5. `declare const o: Record<string, string>;\nexport const v: string = o["k"];` → `npm run typecheck` fails: `noUncheckedIndexedAccess`

After all five: delete `services/_tripwire.ts`, confirm `npm run lint` and `npm run typecheck` pass again.

- [ ] **Step 3: Test suites**

```
npm run test
npm run test:e2e
```
Expected: 3 unit + 1 e2e passed.

- [ ] **Step 4: Viewport screenshots**

Start `npm run dev` in background, then:
```
node .claude/skills/writing-verification-plan/scripts/screenshot.mjs http://localhost:3000
```
Read both PNGs in `.superpowers/screenshots/` (375×812 and 1440×900): page renders, styled (Tailwind active), no broken layout. Stop the server.

- [ ] **Step 5: Environment checks**

```
npx next --version        # equals `npm view next version`
npx @biomejs/biome --version   # ≥ 2.4.11
```
`components.json` exists in repo root.

- [ ] **Step 6: Fresh-clone check**

```
git status --short        # clean
git clean -xdn            # only ignored artifacts listed (node_modules, .next, .superpowers, .env)
```

- [ ] **Step 7: Final commit (if verification produced changes)**

```
git add -A
git commit -m "chore: phase 0 verification pass"
```
(Skip if working tree is clean.)
