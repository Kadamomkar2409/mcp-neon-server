import { getDbClient, auditLogs } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { desc, eq } from "drizzle-orm";

export interface LogAuditParams {
  userId?: string | null;
  toolName: string;
  action: string;
  status: "SUCCESS" | "FAILURE" | "UNAUTHORIZED";
  details?: Record<string, unknown>;
}

export class AuditService {
  /**
   * Records an audit log entry in PostgreSQL.
   */
  async recordAudit(params: LogAuditParams): Promise<void> {
    try {
      const db = getDbClient();
      await db.insert(auditLogs).values({
        userId: params.userId || null,
        toolName: params.toolName,
        action: params.action,
        status: params.status,
        details: params.details || null,
      });

      logger.info(`Audit logged: [${params.status}] ${params.toolName} - ${params.action}`, {
        userId: params.userId,
        tool: params.toolName,
      });
    } catch (error) {
      // Never fail the entire user request just because an audit log failed to write,
      // but log it as a severe warning with safe logging.
      logger.error("Failed to write audit log entry:", error);
    }
  }

  /**
   * Retrieves recent audit logs, optionally filtered by user ID.
   */
  async getRecentLogs(userId?: string, limit: number = 50) {
    const db = getDbClient();
    const query = db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    if (userId) {
      return await query.where(eq(auditLogs.userId, userId));
    }
    return await query;
  }
}

export const auditService = new AuditService();

