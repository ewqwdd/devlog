import DatabaseConstructor from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

const dbFileName = process.env["DB_FILE_NAME"];
if (!dbFileName) {
  throw new DatabaseConfigurationError(
    "DB_FILE_NAME is not set. Copy .env.example to .env and set DB_FILE_NAME.",
  );
}

const client = new DatabaseConstructor(dbFileName);
// SQLite does not enforce ON DELETE CASCADE without this pragma.
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });
export type Database = typeof db;
