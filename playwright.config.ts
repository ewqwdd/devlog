import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // All tests share one SQLite file (reset once per run by global-setup), so
  // they must run serially in a single worker to avoid races.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env["CI"],
    env: { DB_FILE_NAME: ".e2e/devlog-e2e.db" },
  },
});
