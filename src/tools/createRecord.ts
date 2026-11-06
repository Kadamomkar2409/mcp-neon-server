import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordService } from "../services/recordService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const createRecordSchema = {
  title: z
    .string()
    .min(1, "Title must not be empty")
    .max(255, "Title must be at most 255 characters"),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerCreateRecordTool(server: McpServer): void {
  server.registerTool(
    "create_record",
    {
      title: "Create Record",
      description:
        "Use this tool to create a new user-owned record in the database when the user wants to store new structured or unstructured data, notes, items, or documents.",
      inputSchema: createRecordSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const record = await recordService.createRecord({
          userId: user.userId,
          userEmail: user.email,
          userName: user.name,
          title: args.title,
          description: args.description,
          metadata: args.metadata,
        });

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "create_record",
          action: "CREATE",
          status: "SUCCESS",
          details: { recordId: record.id, title: record.title },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Record created successfully.",
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
          toolName: "create_record",
          action: "CREATE",
          status: isAuthError ? "UNAUTHORIZED" : "FAILURE",
          details: { error: safeError, title: args.title },
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

