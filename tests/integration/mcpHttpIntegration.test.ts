import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/server.js";
import { signToken, AuthenticatedUser } from "../../src/middleware/auth.js";
import { getDbClient } from "../../src/db/index.js";
import { users, records, auditLogs } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

function parseMcpResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const dataMatch = text.match(/data:\s*(.+)/);
    if (dataMatch) {
      return JSON.parse(dataMatch[1]);
    }
    throw new Error(`Failed to parse MCP response: ${text}`);
  }
}

describe("MCP Streamable HTTP Integration Tests", () => {
  let server: HttpServer;
  let baseUrl: string;

  const testUser: AuthenticatedUser = {
    userId: randomUUID(),
    email: `mcp-test-${Date.now()}@test.neon`,
    name: "MCP Tester",
  };

  let validToken: string;

  beforeAll(async () => {
    validToken = signToken(testUser);
    const { app } = createApp();

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    try {
      const db = getDbClient();
      await db.delete(auditLogs).where(eq(auditLogs.userId, testUser.userId));
      await db.delete(records).where(eq(records.userId, testUser.userId));
      await db.delete(users).where(eq(users.id, testUser.userId));
    } catch (cleanupErr) {
      console.warn("Cleanup warning in mcpHttpIntegration.test.ts:", cleanupErr);
    }

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("1. GET / returns service information and lists all 8 tools", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; tools: string[]; endpoints: Record<string, unknown> };
    expect(body.status).toBe("RUNNING");
    expect(body.tools.length).toBe(8);
    expect(body.tools).toContain("create_record");
    expect(body.tools).toContain("get_database_stats");
    expect(body.endpoints.oauth).toBeDefined();
  });

  it("2. GET /health checks Neon database connectivity", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; database: { status: string } };
    expect(body.status).toBe("OK");
    expect(body.database.status).toBe("CONNECTED");
  });

  it("3. POST /mcp returns 401 with WWW-Authenticate header when unauthenticated", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "unauth-client", version: "1.0.0" },
        },
      }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("www-authenticate");
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain("Bearer");
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("/.well-known/oauth-protected-resource");

    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toContain("Missing Bearer token");
  });

  it("4. POST /mcp initialize request returns server info and protocol version with Bearer token", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "vitest-client", version: "1.0.0" },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const data = parseMcpResponse(text) as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe("neon-mcp-server");
  });

  it("5. POST /mcp tools/list returns all 8 registered tools with descriptions with Bearer token", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const data = parseMcpResponse(text) as {
      result: { tools: Array<{ name: string; description: string }> };
    };
    const tools = data.result.tools;

    expect(tools.length).toBe(8);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "create_record",
        "get_record",
        "list_records",
        "update_record",
        "delete_record",
        "search_records",
        "get_database_stats",
        "get_system_status",
      ])
    );
  });

  it("6. POST /mcp tools/call create_record executes with Bearer token against Neon", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "create_record",
          arguments: {
            title: "Integration Test Document via HTTP",
            description: "Created via MCP Streamable HTTP transport test",
            metadata: { env: "test" },
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const data = parseMcpResponse(text) as {
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(data.result.content).toBeDefined();

    const toolResult = JSON.parse(data.result.content[0].text);
    expect(toolResult.success).toBe(true);
    expect(toolResult.record.title).toBe("Integration Test Document via HTTP");
  });

  it("7. POST /mcp rejects request with invalid Bearer token and returns 401 with WWW-Authenticate", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer invalid.token.payload",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "get_system_status",
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("www-authenticate");
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain("invalid_token");
    expect(wwwAuth).toContain("resource_metadata=");

    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("Unauthorized");
  });
});
