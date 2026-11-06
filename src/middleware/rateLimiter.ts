import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

interface RateLimitConfig {
  windowMs: number; // e.g. 60,000 ms (1 minute)
  maxRequests: number; // max requests allowed per window
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const clientMap = new Map<string, ClientRecord>();

// Clean up expired records every 5 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of clientMap.entries()) {
    if (now > record.resetTime) {
      clientMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function rateLimiter(
  config: RateLimitConfig = { windowMs: 60 * 1000, maxRequests: 120 }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Identifier: IP address or forwarded IP
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown-client";

    const now = Date.now();
    let record = clientMap.get(clientIp);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      clientMap.set(clientIp, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, config.maxRequests - record.count);
    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader(
      "X-RateLimit-Reset",
      Math.ceil(record.resetTime / 1000)
    );

    if (record.count > config.maxRequests) {
      logger.warn("Rate limit exceeded for client", { clientIp });
      res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please wait before retrying.",
        retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}

export function resetRateLimits(): void {
  clientMap.clear();
}

