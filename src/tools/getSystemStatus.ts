import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { systemService } from "../services/systemService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const getSystemStatusSchema = {
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerGetSystemStatusTool(server: McpServer): void {
  server.registerTool(
    "get_system_status",
    {
      title: "Get System Status",
      description:
        "Use this tool to check MCP server runtime health, platform information, memory usage, uptime, transport configuration, and real-time database connectivity.",
      inputSchema: getSystemStatusSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const system = await systemService.getStatus();

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "get_system_status",
          action: "SYSTEM_STATUS",
          status: "SUCCESS",
          details: { status: system.status, dbStatus: system.database.status },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  system,
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
          toolName: "get_system_status",
          action: "SYSTEM_STATUS",
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

