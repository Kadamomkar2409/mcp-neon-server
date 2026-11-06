import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";
import { getEnv } from "../config/env.js";

export interface SafeAppError {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 400, code: string = "BAD_REQUEST", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function formatSafeErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    // Check for common DB errors without leaking internal connection info
    if (error.message.includes("violates foreign key") || error.message.includes("foreign key constraint")) {
      return "Operation failed: Referenced user or resource does not exist.";
    }
    if (error.message.includes("violates unique constraint") || error.message.includes("duplicate key")) {
      return "Operation failed: A record with this unique attribute already exists.";
    }
    if (error.message.includes("timed out") || error.message.includes("timeout")) {
      return "Database operation timed out. Please try again later.";
    }
    if (error.message.includes("Unauthorized") || error.message.includes("Authentication failed")) {
      return error.message;
    }
    // Generic fallback for unexpected errors
    return error.message;
  }
  return "An unexpected internal server error occurred.";
}

export function expressErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const env = getEnv();
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = formatSafeErrorMessage(err);

  logger.error("Unhandled request error", {
    path: req.path,
    method: req.method,
    statusCode,
    error: err instanceof Error ? err.message : String(err),
    stack: env.NODE_ENV !== "production" && err instanceof Error ? err.stack : undefined,
  });

  res.status(statusCode).json({
    error: err instanceof AppError ? err.code : "INTERNAL_SERVER_ERROR",
    message,
    ...(env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {}),
  });
}

