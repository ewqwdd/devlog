#!/usr/bin/env node
// Viewport screenshot tool for verification plans.
// Captures full-page screenshots of given URLs at mobile + desktop viewports
// using the Playwright installed in the project under test (resolved from cwd).
//
// Usage:
//   node .claude/skills/writing-verification-plan/scripts/screenshot.mjs <url> [url...] [options]
//
// Options:
//   --out <dir>         Output directory (default: .superpowers/screenshots)
//   --viewports <list>  Comma-separated WxH list (default: 375x812,1440x900)
//   --wait <ms>         Extra delay after page load, for animations (default: 500)
//   --no-full-page      Capture only the viewport instead of the full page
//
// Example:
//   node .claude/skills/writing-verification-plan/scripts/screenshot.mjs \
//     http://localhost:3000 http://localhost:3000/tasks --out shots
//
// Exit code: 0 if all screenshots succeeded, 1 otherwise.

import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const DEFAULT_VIEWPORTS = "375x812,1440x900";

function parseArgs(argv) {
  const urls = [];
  const opts = { out: ".superpowers/screenshots", viewports: DEFAULT_VIEWPORTS, wait: 500, fullPage: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--viewports") opts.viewports = argv[++i];
    else if (arg === "--wait") opts.wait = Number(argv[++i]);
    else if (arg === "--no-full-page") opts.fullPage = false;
    else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else urls.push(arg);
  }
  return { urls, opts };
}

function parseViewports(spec) {
  return spec.split(",").map((part) => {
    const match = part.trim().match(/^(\d+)x(\d+)$/);
    if (!match) {
      console.error(`Invalid viewport "${part}" — expected WxH like 375x812`);
      process.exit(1);
    }
    return { width: Number(match[1]), height: Number(match[2]) };
  });
}

// Resolve Playwright from the project being tested (cwd), not from this
// script's location, so the project's own version and browsers are used.
async function loadChromium() {
  const require = createRequire(join(process.cwd(), "package.json"));
  for (const pkg of ["playwright", "@playwright/test", "playwright-core"]) {
    try {
      const modPath = require.resolve(pkg);
      const mod = await import(`file://${modPath.replace(/\\/g, "/")}`);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      // try next package
    }
  }
  console.error(
    "Playwright not found in this project. Install it first: npm i -D playwright (or @playwright/test) && npx playwright install chromium",
  );
  process.exit(1);
}

function slugForUrl(url) {
  const { host, pathname } = new URL(url);
  const path = pathname.replace(/\/+$/, "").replace(/^\//, "").replace(/[^a-zA-Z0-9-]+/g, "-") || "home";
  return `${host.replace(/[^a-zA-Z0-9-]+/g, "-")}--${path}`;
}

const { urls, opts } = parseArgs(process.argv.slice(2));
if (urls.length === 0) {
  console.error("Usage: screenshot.mjs <url> [url...] [--out dir] [--viewports WxH,WxH] [--wait ms] [--no-full-page]");
  process.exit(1);
}

const viewports = parseViewports(opts.viewports);
const outDir = resolve(opts.out);
await mkdir(outDir, { recursive: true });

const chromium = await loadChromium();
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error(`Failed to launch Chromium: ${error.message.split("\n")[0]}`);
  console.error("If the browser is missing, run: npx playwright install chromium");
  process.exit(1);
}
let failures = 0;

for (const url of urls) {
  for (const viewport of viewports) {
    const file = join(outDir, `${slugForUrl(url)}--${viewport.width}x${viewport.height}.png`);
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      if (opts.wait > 0) await page.waitForTimeout(opts.wait);
      await page.screenshot({ path: file, fullPage: opts.fullPage });
      console.log(`OK  ${url} @ ${viewport.width}x${viewport.height} -> ${file}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${url} @ ${viewport.width}x${viewport.height}: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
}

await browser.close();
process.exit(failures > 0 ? 1 : 0);
