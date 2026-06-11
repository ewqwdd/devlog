import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

const tempDbFile = join(tmpdir(), `devlog-test-${randomUUID()}.db`);
process.env["DB_FILE_NAME"] = tempDbFile;

// Dynamic imports: must happen AFTER the env assignment above.
const { db } = await import("@/shared/infra/db");
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { tasks } = await import("@/shared/infra/db/schema"); // schema itself is env-neutral; dynamic only for consistency with the db import

// Same SQL the production database gets — not a parallel schema.
migrate(db, { migrationsFolder: "./drizzle" });

beforeEach(() => {
  // Wiping tasks cascades to subtasks and status_updates (FK pragma is on).
  db.delete(tasks).run();
});

afterAll(() => {
  db.$client.close();
  if (existsSync(tempDbFile)) {
    unlinkSync(tempDbFile);
  }
});
