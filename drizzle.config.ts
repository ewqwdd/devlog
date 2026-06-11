import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const dbFileName = process.env["DB_FILE_NAME"];
if (!dbFileName) {
  throw new Error("DB_FILE_NAME is not set. Copy .env.example to .env first.");
}

export default defineConfig({
  schema: "./shared/infra/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: dbFileName },
});
