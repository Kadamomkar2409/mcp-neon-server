import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordService } from "../services/recordService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const deleteRecordSchema = {
  recordId: z.string().uuid("recordId must be a valid UUID"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerDeleteRecordTool(server: McpServer): void {
  server.registerTool(
    "delete_record",
    {
      title: "Delete Record",
      description:
        "Use this tool to permanently remove an existing record from the database. Only the authorized owner of the record can delete it.",
      inputSchema: deleteRecordSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const result = await recordService.deleteRecord({
          userId: user.userId,
          recordId: args.recordId,
        });

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "delete_record",
          action: "DELETE",
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
                  message: "Record permanently deleted.",
                  deletedRecordId: result.deletedRecordId,
                  deletedAt: result.deletedAt,
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
          toolName: "delete_record",
          action: "DELETE",
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

