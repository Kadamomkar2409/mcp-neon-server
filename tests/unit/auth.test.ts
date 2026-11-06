import { describe, it, expect, beforeEach } from "vitest";
import {
  signToken,
  verifyToken,
  resolveUser,
  authStorage,
  AuthenticatedUser,
} from "../../src/middleware/auth.js";
import { resetEnvCache } from "../../src/config/env.js";

describe("Authentication & JWT Middleware", () => {
  const testUser: AuthenticatedUser = {
    userId: "11111111-1111-4111-8111-111111111111",
    email: "developer@example.com",
    name: "Test Developer",
  };

  beforeEach(() => {
    process.env.AUTH_SECRET = "super_secret_jwt_key_at_least_32_characters_long";
    resetEnvCache();
  });

  it("signs and verifies a valid JWT token", () => {
    const token = signToken(testUser);
    expect(typeof token).toBe("string");

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(testUser.userId);
    expect(decoded.email).toBe(testUser.email);
    expect(decoded.name).toBe(testUser.name);
  });

  it("rejects an invalid token", () => {
    expect(() => verifyToken("invalid.jwt.token")).toThrow(
      "Authentication failed"
    );
  });

  it("rejects a token signed with a different secret", () => {
    const token = signToken(testUser);

    // Change secret
    process.env.AUTH_SECRET = "different_secret_key_at_least_32_characters_long";
    resetEnvCache();

    expect(() => verifyToken(token)).toThrow("Authentication failed");
  });

  it("resolves user from authStorage context", () => {
    const token = signToken(testUser);
    authStorage.run({ user: testUser, token }, () => {
      const resolved = resolveUser();
      expect(resolved.userId).toBe(testUser.userId);
      expect(resolved.email).toBe(testUser.email);
    });
  });

  it("resolves user from fallback token when not in storage context", () => {
    const token = signToken(testUser);
    const resolved = resolveUser(token);
    expect(resolved.userId).toBe(testUser.userId);
  });

  it("throws Unauthorized when no context and no token provided", () => {
    expect(() => resolveUser()).toThrow(
      "Unauthorized: No valid authentication credentials provided"
    );
  });
});

