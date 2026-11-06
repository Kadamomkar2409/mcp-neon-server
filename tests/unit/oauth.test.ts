import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/server.js";
import { Server as HttpServer } from "node:http";

describe("OAuth 2.0 Endpoints", () => {
  let server: HttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves RFC 8414 OAuth authorization server metadata", async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
      response_types_supported: string[];
    };
    expect(body.authorization_endpoint).toContain("/oauth/authorize");
    expect(body.token_endpoint).toContain("/oauth/token");
    expect(body.response_types_supported).toContain("code");
  });

  it("handles OAuth /oauth/authorize redirect", async () => {
    const redirectTarget = "https://chatgpt.com/aip/g-1234/oauth/callback";
    const res = await fetch(
      `${baseUrl}/oauth/authorize?client_id=chatgpt&redirect_uri=${encodeURIComponent(
        redirectTarget
      )}&state=random_state_123&response_type=code`,
      { redirect: "manual" }
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain(redirectTarget);
    expect(location).toContain("code=auth_code_");
    expect(location).toContain("state=random_state_123");
  });

  it("exchanges authorization code for JWT access token at /oauth/token", async () => {
    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "auth_code_12345",
        client_id: "chatgpt",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token_type: string;
      access_token: string;
      expires_in: number;
    };
    expect(body.token_type).toBe("Bearer");
    expect(body.access_token).toBeDefined();
    expect(body.expires_in).toBeGreaterThan(0);
  });
});
