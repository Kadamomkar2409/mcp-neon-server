import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, resetEnvCache } from "../../src/config/env.js";

describe("Environment Configuration Validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  it("fails if DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    process.env.AUTH_SECRET = "super_secret_key_minimum_16_characters";

    expect(() => getEnv()).toThrow("DATABASE_URL is required");
  });

  it("fails if AUTH_SECRET is too short", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.AUTH_SECRET = "short";

    expect(() => getEnv()).toThrow("AUTH_SECRET must be at least 16 characters long");
  });

  it("validates successfully with correct environment variables", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.AUTH_SECRET = "super_secret_key_minimum_16_characters";
    process.env.PORT = "4000";
    process.env.NODE_ENV = "test";
    process.env.MCP_TRANSPORT = "streamable-http";

    const env = getEnv();
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
    expect(env.MCP_TRANSPORT).toBe("streamable-http");
  });
});
