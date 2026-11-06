import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordService } from "../services/recordService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const getRecordSchema = {
  recordId: z.string().uuid("recordId must be a valid UUID"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerGetRecordTool(server: McpServer): void {
  server.registerTool(
    "get_record",
    {
      title: "Get Record",
      description:
        "Use this tool to retrieve a specific record by its unique UUID ID when the user requests details, contents, or metadata of an existing record they own.",
      inputSchema: getRecordSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const record = await recordService.getRecord({
          userId: user.userId,
          recordId: args.recordId,
        });

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "get_record",
          action: "READ",
          status: "SUCCESS",
          details: { recordId: args.recordId },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  record,
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
          toolName: "get_record",
          action: "READ",
          status: isAuthError ? "UNAUTHORIZED" : "FAILURE",
          details: { error: safeError, recordId: args.recordId },
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

