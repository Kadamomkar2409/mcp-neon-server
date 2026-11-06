import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordService } from "../services/recordService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const listRecordsSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max number of records to return (1-100, default 20)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of records to skip (default 0)"),
  titleFilter: z
    .string()
    .optional()
    .describe("Filter records where title contains this substring"),
  createdAfter: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional()
    .describe("Filter records created on or after this ISO date string"),
  createdBefore: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional()
    .describe("Filter records created on or before this ISO date string"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerListRecordsTool(server: McpServer): void {
  server.registerTool(
    "list_records",
    {
      title: "List Records",
      description:
        "Use this tool to browse or paginate through all records owned by the authenticated user, optionally filtering by title keyword or creation date range.",
      inputSchema: listRecordsSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const result = await recordService.listRecords({
          userId: user.userId,
          limit: args.limit,
          offset: args.offset,
          titleFilter: args.titleFilter,
          createdAfter: args.createdAfter,
          createdBefore: args.createdBefore,
        });

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "list_records",
          action: "LIST",
          status: "SUCCESS",
          details: {
            returnedCount: result.records.length,
            totalCount: result.pagination.total,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  records: result.records,
                  pagination: result.pagination,
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
          toolName: "list_records",
          action: "LIST",
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

