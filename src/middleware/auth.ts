import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AsyncLocalStorage } from "node:async_hooks";
import { getEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name?: string;
}

export interface AuthContext {
  user: AuthenticatedUser;
  token: string;
}

export const authStorage = new AsyncLocalStorage<AuthContext>();

/**
 * Signs a JWT access token for a given user payload.
 */
export function signToken(
  user: AuthenticatedUser,
  expiresIn: string | number = "7d"
): string {
  const env = getEnv();
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      name: user.name,
    },
    env.AUTH_SECRET,
    {
      expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
      issuer: "mcp-server",
      audience: "mcp-client",
    }
  );
}

/**
 * Verifies a JWT access token using the configured AUTH_SECRET.
 * Throws an Error if invalid or expired.
 */
export function verifyToken(token: string): AuthenticatedUser {
  const env = getEnv();
  try {
    const decoded = jwt.verify(token, env.AUTH_SECRET, {
      issuer: "mcp-server",
      audience: "mcp-client",
    }) as jwt.JwtPayload;

    if (!decoded.sub || !decoded.email) {
      throw new Error("Invalid token claims: missing subject or email");
    }

    return {
      userId: decoded.sub,
      email: decoded.email,
      name: (decoded.name as string) || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token verification failed";
    logger.warn("JWT verification failure", { reason: message });
    throw new Error(`Authentication failed: ${message}`);
  }
}

/**
 * Extracts Bearer token from Express request Authorization header.
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }

  return null;
}

/**
 * Express middleware to authenticate incoming HTTP requests.
 * Extracts Bearer token, verifies JWT, and sets AsyncLocalStorage context.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);

  if (!token) {
    // If request has no Authorization header
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing Bearer token in Authorization header",
    });
    return;
  }

  try {
    const user = verifyToken(token);
    authStorage.run({ user, token }, () => {
      // Also attach to request object
      (req as unknown as { auth: AuthContext }).auth = { user, token };
      next();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid token";
    res.status(401).json({
      error: "Unauthorized",
      message: msg,
    });
  }
}

/**
 * Helper to resolve the authenticated user.
 * Checks AsyncLocalStorage context first; optionally verifies fallback token string.
 */
export function resolveUser(fallbackToken?: string): AuthenticatedUser {
  const store = authStorage.getStore();
  if (store && store.user) {
    return store.user;
  }

  if (fallbackToken) {
    return verifyToken(fallbackToken);
  }

  throw new Error("Unauthorized: No valid authentication credentials provided");
}

