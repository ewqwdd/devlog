import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared/infra/db", () => {
  it("throws a clear error when DB_FILE_NAME is not set", async () => {
    vi.stubEnv("DB_FILE_NAME", undefined);
    await expect(import("@/shared/infra/db")).rejects.toThrow(/DB_FILE_NAME/);
  });
});
