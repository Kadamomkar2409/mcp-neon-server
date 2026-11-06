import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { checkDatabaseHealth } from "./db/index.js";
import { registerAllTools } from "./tools/index.js";
import {
  authStorage,
  extractBearerToken,
  verifyToken,
} from "./middleware/auth.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { expressErrorHandler } from "./middleware/errorHandler.js";
import type { Server as HttpServer } from "node:http";

/**
 * Creates and initializes an McpServer instance with all tools registered.
 */
export function createMcpServerInstance(): McpServer {
  const mcpServer = new McpServer({
    name: "neon-mcp-server",
    version: "1.0.0",
  });
  registerAllTools(mcpServer);
  return mcpServer;
}

export function createApp(): {
  app: express.Application;
} {
  const env = getEnv();
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Global rate limiter
  app.use(rateLimiter({ windowMs: 60 * 1000, maxRequests: 120 }));

  // Endpoint 1: Root / (Service Info)
  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      name: "neon-mcp-server",
      version: "1.0.0",
      description: "Production-ready Model Context Protocol (MCP) Server for ChatGPT & NitroCloud",
      transport: env.MCP_TRANSPORT,
      status: "RUNNING",
      endpoints: {
        health: "/health",
        mcp: "/mcp",
        info: "/",
      },
      tools: [
        "create_record",
        "get_record",
        "list_records",
        "update_record",
        "delete_record",
        "search_records",
        "get_database_stats",
        "get_system_status",
      ],
      timestamp: new Date().toISOString(),
    });
  });

  // Endpoint 2: /health (Database connectivity & system health)
  app.get("/health", async (_req: Request, res: Response) => {
    try {
      const dbHealth = await checkDatabaseHealth(3000);
      const isHealthy = dbHealth.healthy;

      const healthPayload = {
        status: isHealthy ? "OK" : "DEGRADED",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        database: {
          status: isHealthy ? "CONNECTED" : "UNREACHABLE",
          latencyMs: dbHealth.latencyMs,
          error: dbHealth.error,
        },
      };

      res.status(isHealthy ? 200 : 503).json(healthPayload);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Health check failure";
      logger.error("Health endpoint error:", errorMessage);
      res.status(503).json({
        status: "DOWN",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Endpoint 3: /mcp (Streamable HTTP for MCP)
  app.all("/mcp", async (req: Request, res: Response) => {
    // Check for optional Bearer token in headers to populate request-scoped authStorage
    const token = extractBearerToken(req);
    let userContext: { user: { userId: string; email: string; name?: string }; token: string } | undefined;

    if (token) {
      try {
        const user = verifyToken(token);
        userContext = { user, token };
      } catch (tokenErr) {
        logger.warn("Request to /mcp with invalid Bearer token", { error: tokenErr });
        res.status(401).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Unauthorized: Invalid or expired Bearer token",
          },
          id: req.body?.id ?? null,
        });
        return;
      }
    }

    const serverInstance = createMcpServerInstance();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true,
    });

    await serverInstance.connect(transport);

    if (userContext) {
      await authStorage.run(userContext, async () => {
        await transport.handleRequest(req, res, req.body);
      });
    } else {
      await transport.handleRequest(req, res, req.body);
    }
  });

  // Error handling middleware
  app.use(expressErrorHandler);

  return { app };
}

let httpServer: HttpServer | null = null;

export async function startServer(): Promise<HttpServer> {
  const env = getEnv();
  const { app } = createApp();

  return new Promise((resolve) => {
    httpServer = app.listen(env.PORT, "0.0.0.0", () => {
      logger.info(`MCP Server started successfully on port ${env.PORT}`, {
        port: env.PORT,
        env: env.NODE_ENV,
        transport: env.MCP_TRANSPORT,
      });
      resolve(httpServer!);
    });
  });
}

export async function stopServer(): Promise<void> {
  if (httpServer) {
    return new Promise((resolve, reject) => {
      httpServer!.close((err) => {
        if (err) {
          logger.error("Error shutting down HTTP server:", err);
          return reject(err);
        }
        logger.info("HTTP server closed gracefully.");
        httpServer = null;
        resolve();
      });
    });
  }
}

// Graceful shutdown handling
function registerProcessHandlers() {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    try {
      await stopServer();
      process.exit(0);
    } catch (err) {
      logger.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

registerProcessHandlers();

// Start immediately when executed directly
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  startServer().catch((err) => {
    logger.error("Fatal startup error:", err);
    process.exit(1);
  });
}
