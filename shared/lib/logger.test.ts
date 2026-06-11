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
    vi.stubEnv("LOG_LEVEL", "info");
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
