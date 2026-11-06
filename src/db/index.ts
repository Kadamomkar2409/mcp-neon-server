import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { getEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";

let dbInstance: NeonHttpDatabase<typeof schema> | null = null;

export function getDbClient(): NeonHttpDatabase<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  const env = getEnv();
  const sql = neon(env.DATABASE_URL);
  dbInstance = drizzle(sql, { schema });
  return dbInstance;
}

/**
 * Health check with timeout to verify Neon DB connectivity.
 * Returns true if DB is responsive, false or throws if unhealthy.
 */
export async function checkDatabaseHealth(timeoutMs: number = 5000): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    const env = getEnv();
    const sql = neon(env.DATABASE_URL);

    // Timeout protection
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Database health check timed out")), timeoutMs);
    });

    const queryPromise = sql`SELECT 1 as health_check`;

    await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;
    return { healthy: true, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown database error";
    logger.error("Database health check failed", { error: errorMessage, latencyMs });
    return {
      healthy: false,
      latencyMs,
      error: errorMessage,
    };
  }
}

export * from "./schema.js";

