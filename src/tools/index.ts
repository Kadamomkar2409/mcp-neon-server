import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateRecordTool } from "./createRecord.js";
import { registerGetRecordTool } from "./getRecord.js";
import { registerListRecordsTool } from "./listRecords.js";
import { registerUpdateRecordTool } from "./updateRecord.js";
import { registerDeleteRecordTool } from "./deleteRecord.js";
import { registerSearchRecordsTool } from "./searchRecords.js";
import { registerGetDatabaseStatsTool } from "./getDatabaseStats.js";
import { registerGetSystemStatusTool } from "./getSystemStatus.js";

/**
 * Registers all 8 required MCP tools onto the given McpServer instance.
 */
export function registerAllTools(server: McpServer): void {
  registerCreateRecordTool(server);
  registerGetRecordTool(server);
  registerListRecordsTool(server);
  registerUpdateRecordTool(server);
  registerDeleteRecordTool(server);
  registerSearchRecordsTool(server);
  registerGetDatabaseStatsTool(server);
  registerGetSystemStatusTool(server);
}

export * from "./createRecord.js";
export * from "./getRecord.js";
export * from "./listRecords.js";
export * from "./updateRecord.js";
export * from "./deleteRecord.js";
export * from "./searchRecords.js";
export * from "./getDatabaseStats.js";
export * from "./getSystemStatus.js";

