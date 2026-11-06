import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { statsService } from "../services/statsService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const getDatabaseStatsSchema = {
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerGetDatabaseStatsTool(server: McpServer): void {
  server.registerTool(
    "get_database_stats",
    {
      title: "Get Database Stats",
      description:
        "Use this tool to inspect database metrics, including record counts, user-specific record statistics, activity over the last 24 hours, and Neon database connection health.",
      inputSchema: getDatabaseStatsSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const stats = await statsService.getStats(user.userId);

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "get_database_stats",
          action: "STATS",
          status: "SUCCESS",
          details: { latencyMs: stats.databaseHealth.latencyMs },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  stats,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const safeError = formatSafeErrorMessage(error);
        const isAuthError =
          safeError.includes("Unauthorized") || safeError.includes("Forbidden");

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "get_database_stats",
          action: "STATS",
          status: isAuthError ? "UNAUTHORIZED" : "FAILURE",
          details: { error: safeError },
        });

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: safeError,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}

