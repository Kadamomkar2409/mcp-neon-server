import { describe, it, expect, vi } from "vitest";
import { logger } from "../../src/utils/logger.js";

describe("Safe Logger", () => {
  it("redacts bearer tokens, database URLs, and passwords in strings and objects", () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("Connecting to postgresql://admin:secret123@neon.tech/db");

    expect(logSpy).toHaveBeenCalled();
    const loggedStr = logSpy.mock.calls[0][0];
    expect(loggedStr).not.toContain("secret123");
    expect(loggedStr).toContain("[REDACTED]");

    logger.info("Handling auth with payload", {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakMe",
      password: "mySecretPassword",
      safeField: "safeValue",
    });

    const secondLog = logSpy.mock.calls[1][0];
    expect(secondLog).not.toContain("mySecretPassword");
    expect(secondLog).not.toContain("doNotLeakMe");
    expect(secondLog).toContain('"password":"[REDACTED]"');
    expect(secondLog).toContain('"safeField":"safeValue"');

    consoleSpy.mockRestore();
    logSpy.mockRestore();
  });
});

