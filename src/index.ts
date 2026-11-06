import { startServer } from "./server.js";
export * from "./server.js";

// Main entry point for NitroStack MCP Server
startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
