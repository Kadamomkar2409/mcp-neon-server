import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordService } from "../services/recordService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const updateRecordSchema = {
  recordId: z.string().uuid("recordId must be a valid UUID"),
  title: z
    .string()
    .min(1, "Title must not be empty")
    .max(255, "Title must be at most 255 characters")
    .optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerUpdateRecordTool(server: McpServer): void {
  server.registerTool(
    "update_record",
    {
      title: "Update Record",
      description:
        "Use this tool to update the title, description, or metadata of an existing record owned by the user. Only the record owner can update it.",
      inputSchema: updateRecordSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const updated = await recordService.updateRecord({
          userId: user.userId,
          recordId: args.recordId,
          title: args.title,
          description: args.description,
          metadata: args.metadata,
        });

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "update_record",
          action: "UPDATE",
          status: "SUCCESS",
          details: { recordId: args.recordId, title: updated.title },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Record updated successfully.",
                  record: updated,
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
          toolName: "update_record",
          action: "UPDATE",
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

