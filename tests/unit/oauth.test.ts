import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/server.js";
import { verifyToken } from "../../src/middleware/auth.js";
import { base64url } from "../../src/middleware/oauth.js";
import { Server as HttpServer } from "node:http";
import crypto from "node:crypto";

describe("OAuth 2.0 & MCP Authorization Endpoints", () => {
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

  it("1. GET /.well-known/oauth-protected-resource returns RFC 8707 metadata", async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
      scopes_supported: string[];
    };
    expect(body.resource).toBe(`${baseUrl}/mcp`);
    expect(body.authorization_servers).toContain(baseUrl);
    expect(body.scopes_supported).toContain("mcp");
  });

  it("2. GET /.well-known/oauth-authorization-server returns RFC 8414 metadata with PKCE S256 and register endpoint", async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
      grant_types_supported: string[];
    };
    expect(body.issuer).toBe(baseUrl);
    expect(body.authorization_endpoint).toBe(`${baseUrl}/oauth/authorize`);
    expect(body.token_endpoint).toBe(`${baseUrl}/oauth/token`);
    expect(body.registration_endpoint).toBe(`${baseUrl}/oauth/register`);
    expect(body.code_challenge_methods_supported).toContain("S256");
    expect(body.grant_types_supported).toContain("authorization_code");
  });

  it("3. POST /oauth/register dynamically registers an MCP client", async () => {
    const res = await fetch(`${baseUrl}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Test Dynamic Client",
        redirect_uris: ["https://chatgpt.com/aip/test/oauth/callback"],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      client_id: string;
      client_name: string;
      redirect_uris: string[];
    };
    expect(body.client_id).toBeDefined();
    expect(body.client_name).toBe("Test Dynamic Client");
    expect(body.redirect_uris).toContain("https://chatgpt.com/aip/test/oauth/callback");
  });

  it("4. GET /oauth/authorize rejects request missing PKCE code_challenge", async () => {
    const res = await fetch(
      `${baseUrl}/oauth/authorize?client_id=chatgpt&redirect_uri=https://chatgpt.com/aip/oauth/callback&response_type=code`
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; error_description: string };
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toContain("code_challenge");
  });

  it("5. GET /oauth/authorize rejects unauthorized redirect_uri", async () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());

    const res = await fetch(
      `${baseUrl}/oauth/authorize?client_id=chatgpt&redirect_uri=https://malicious-site.com/callback&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("6. GET /oauth/authorize renders HTML consent page when approval is needed", async () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());

    const res = await fetch(
      `${baseUrl}/oauth/authorize?client_id=chatgpt&redirect_uri=https://chatgpt.com/aip/oauth/callback&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Authorize");
    expect(html).toContain("ChatGPT Connector");
    expect(html).toContain("Scope: mcp");
  });

  it("7. Full OAuth PKCE Flow: authorize -> exchange token with code_verifier -> verify JWT", async () => {
    // Step A: Generate PKCE verifier and S256 challenge
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    const redirectTarget = "https://chatgpt.com/aip/oauth/callback";

    // Step B: Request authorize with auto_approve=true
    const authRes = await fetch(
      `${baseUrl}/oauth/authorize?client_id=chatgpt&redirect_uri=${encodeURIComponent(
        redirectTarget
      )}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=state_xyz&auto_approve=true`,
      { redirect: "manual" }
    );

    expect(authRes.status).toBe(302);
    const location = authRes.headers.get("location");
    expect(location).toBeDefined();

    const redirectUrl = new URL(location!);
    const code = redirectUrl.searchParams.get("code");
    const state = redirectUrl.searchParams.get("state");
    expect(code).toBeDefined();
    expect(code).toMatch(/^auth_/);
    expect(state).toBe("state_xyz");

    // Step C: Try token exchange with WRONG verifier (must fail)
    const failRes = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: "chatgpt",
        redirect_uri: redirectTarget,
        code_verifier: "wrong_verifier_12345",
      }),
    });
    expect(failRes.status).toBe(400);

    // Code is single-use, so get a fresh code for successful exchange
    const authRes2 = await fetch(
      `${baseUrl}/oauth/authorize?client_id=chatgpt&redirect_uri=${encodeURIComponent(
        redirectTarget
      )}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&auto_approve=true`,
      { redirect: "manual" }
    );
    const validCode = new URL(authRes2.headers.get("location")!).searchParams.get("code")!;

    // Step D: Exchange with CORRECT code_verifier (must succeed)
    const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: validCode,
        client_id: "chatgpt",
        redirect_uri: redirectTarget,
        code_verifier: verifier,
      }),
    });

    expect(tokenRes.status).toBe(200);
    const tokenBody = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token?: string;
    };
    expect(tokenBody.token_type).toBe("Bearer");
    expect(tokenBody.access_token).toBeDefined();
    expect(tokenBody.expires_in).toBeGreaterThan(0);

    // Step E: Verify token is valid JWT and belongs to ChatGPT user
    const decodedUser = verifyToken(tokenBody.access_token);
    expect(decodedUser.userId).toBe("00000000-0000-4000-a000-000000000001");
    expect(decodedUser.email).toBe("chatgpt-user@nitrocloud.mcp");
  });
});
