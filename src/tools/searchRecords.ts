import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordService } from "../services/recordService.js";
import { auditService } from "../services/auditService.js";
import { resolveUser } from "../middleware/auth.js";
import { formatSafeErrorMessage } from "../middleware/errorHandler.js";

export const searchRecordsSchema = {
  query: z
    .string()
    .min(1, "Search query must not be empty")
    .describe("Keywords or phrases to search across title and description"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max number of matches to return (1-100, default 20)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of records to skip (default 0)"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token if not provided in HTTP Authorization header"),
};

export function registerSearchRecordsTool(server: McpServer): void {
  server.registerTool(
    "search_records",
    {
      title: "Search Records",
      description:
        "Use this tool to search for keywords or phrases across record titles and descriptions owned by the user when looking for specific topics or content.",
      inputSchema: searchRecordsSchema,
    },
    async (args) => {
      let currentUserId: string | null = null;
      try {
        const user = resolveUser(args.authToken);
        currentUserId = user.userId;

        const result = await recordService.searchRecords({
          userId: user.userId,
          query: args.query,
          limit: args.limit,
          offset: args.offset,
        });

        await auditService.recordAudit({
          userId: currentUserId,
          toolName: "search_records",
          action: "SEARCH",
          status: "SUCCESS",
          details: { query: args.query, totalMatches: result.totalMatches },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  query: result.query,
                  totalMatches: result.totalMatches,
                  records: result.records,
                  limit: result.limit,
                  offset: result.offset,
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
          toolName: "search_records",
          action: "SEARCH",
          status: isAuthError ? "UNAUTHORIZED" : "FAILURE",
          details: { error: safeError, query: args.query },
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

