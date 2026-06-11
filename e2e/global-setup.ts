import { existsSync, mkdirSync, rmSync } from "node:fs";

const DB_FILE = ".e2e/devlog-e2e.db";

async function globalSetup(): Promise<void> {
  mkdirSync(".e2e", { recursive: true });
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${DB_FILE}${suffix}`;
    if (existsSync(file)) {
      rmSync(file);
    }
  }
  // Must set the env before importing the db client (it reads DB_FILE_NAME at import).
  process.env["DB_FILE_NAME"] = DB_FILE;
  // Relative import (not the @/ alias) so this resolves under Playwright's loader.
  const { db } = await import("../shared/infra/db");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  migrate(db, { migrationsFolder: "./drizzle" });
}

export default globalSetup;
