import { describe, it, expect, beforeEach } from "vitest";
import { rateLimiter, resetRateLimits } from "../../src/middleware/rateLimiter.js";
import type { Request, Response } from "express";

describe("Rate Limiter Middleware", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests within rate limit threshold", () => {
    const limiter = rateLimiter({ windowMs: 10000, maxRequests: 2 });

    const req = {
      headers: { "x-forwarded-for": "192.168.1.100" },
      socket: {},
    } as unknown as Request;

    const headers: Record<string, string | number> = {};
    const res = {
      setHeader: (key: string, val: string | number) => {
        headers[key] = val;
      },
      status: () => res,
      json: () => {},
    } as unknown as Response;

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    limiter(req, res, next);
    expect(nextCalled).toBe(true);
    expect(headers["X-RateLimit-Remaining"]).toBe(1);
  });

  it("blocks requests exceeding rate limit threshold with 429", () => {
    const limiter = rateLimiter({ windowMs: 10000, maxRequests: 1 });

    const req = {
      headers: { "x-forwarded-for": "192.168.1.101" },
      socket: {},
    } as unknown as Request;

    let statusCode = 200;
    let jsonBody: unknown = null;
    const res = {
      setHeader: () => {},
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: unknown) => {
        jsonBody = data;
      },
    } as unknown as Response;

    let nextCount = 0;
    const next = () => {
      nextCount++;
    };

    // First request - allowed
    limiter(req, res, next);
    expect(nextCount).toBe(1);

    // Second request - blocked
    limiter(req, res, next);
    expect(nextCount).toBe(1); // not called again
    expect(statusCode).toBe(429);
    expect((jsonBody as { error: string }).error).toBe("Too Many Requests");
  });
});

