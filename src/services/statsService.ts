import {
  getDbClient,
  records,
  users,
  auditLogs,
  checkDatabaseHealth,
} from "../db/index.js";
import { count, eq, gte, sql } from "drizzle-orm";

export interface DatabaseStats {
  userStats: {
    userId: string;
    totalUserRecords: number;
    recordsCreatedLast24Hours: number;
  };
  systemStats: {
    totalRecords: number;
    totalUsers: number;
    totalAuditLogs: number;
  };
  databaseHealth: {
    healthy: boolean;
    latencyMs: number;
  };
  timestamp: string;
}

export class StatsService {
  /**
   * Retrieves aggregate and user-scoped database statistics.
   */
  async getStats(userId: string): Promise<DatabaseStats> {
    const db = getDbClient();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Concurrently fetch counts
    const [
      userTotalResult,
      user24hResult,
      systemTotalResult,
      totalUsersResult,
      totalAuditResult,
      healthResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(records).where(eq(records.userId, userId)),
      db
        .select({ count: count() })
        .from(records)
        .where(
          sql`${records.userId} = ${userId} AND ${records.createdAt} >= ${oneDayAgo}`
        ),
      db.select({ count: count() }).from(records),
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(auditLogs),
      checkDatabaseHealth(3000),
    ]);

    return {
      userStats: {
        userId,
        totalUserRecords: userTotalResult[0]?.count ?? 0,
        recordsCreatedLast24Hours: user24hResult[0]?.count ?? 0,
      },
      systemStats: {
        totalRecords: systemTotalResult[0]?.count ?? 0,
        totalUsers: totalUsersResult[0]?.count ?? 0,
        totalAuditLogs: totalAuditResult[0]?.count ?? 0,
      },
      databaseHealth: {
        healthy: healthResult.healthy,
        latencyMs: healthResult.latencyMs,
      },
      timestamp: now.toISOString(),
    };
  }
}

export const statsService = new StatsService();

