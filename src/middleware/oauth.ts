import { Request, Response } from "express";
import crypto from "node:crypto";
import { getEnv } from "../config/env.js";
import { signToken, AuthenticatedUser } from "./auth.js";
import { logger } from "../utils/logger.js";

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  createdAt: number;
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  user: AuthenticatedUser;
  expiresAt: number;
}

// In-memory stores for clients and pending auth codes
const clientsStore = new Map<string, RegisteredClient>();
const authCodesStore = new Map<string, AuthorizationCode>();

// Seed default known client for ChatGPT
const DEFAULT_CHATGPT_CLIENT_ID = "chatgpt";
clientsStore.set(DEFAULT_CHATGPT_CLIENT_ID, {
  clientId: DEFAULT_CHATGPT_CLIENT_ID,
  clientName: "ChatGPT Connector",
  redirectUris: [
    "https://chatgpt.com/aip/oauth/callback",
    "https://chat.openai.com/aip/oauth/callback",
    "https://platform.openai.com/oauth/callback",
  ],
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  createdAt: Date.now(),
});

// Periodic cleanup of expired auth codes
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodesStore.entries()) {
    if (now > entry.expiresAt) {
      authCodesStore.delete(code);
    }
  }
}, 60 * 1000).unref();

/**
 * Resolves the public base URL, giving precedence to:
 * 1. env.PUBLIC_BASE_URL (configured explicitly in NitroCloud)
 * 2. X-Forwarded-Proto + X-Forwarded-Host headers from reverse proxy
 * 3. req.protocol + req.get('host')
 * Always ensures https:// unless explicitly running on localhost in development.
 */
export function getBaseUrl(req: Request): string {
  const env = getEnv();
  if (env.PUBLIC_BASE_URL) {
    return env.PUBLIC_BASE_URL;
  }

  const forwardedProto = req.headers["x-forwarded-proto"] as string | undefined;
  const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
  const protoHeader = forwardedProto ? forwardedProto.split(",")[0].trim() : undefined;
  const host = forwardedHost ? forwardedHost.split(",")[0].trim() : req.get("host") || "localhost:3000";

  // Force HTTPS when not on loopback or when proxy indicates HTTPS
  let proto = protoHeader || req.protocol || "http";
  if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    proto = "https";
  }

  return `${proto}://${host}`;
}

/**
 * Converts a buffer to URL-safe base64 string without padding (RFC 7636).
 */
export function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Verifies code_verifier against code_challenge using SHA256 (RFC 7636 S256).
 */
export function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: string = "S256"
): boolean {
  if (method !== "S256") {
    return false;
  }
  const hash = crypto.createHash("sha256").update(verifier).digest();
  const computedChallenge = base64url(hash);
  return computedChallenge === challenge;
}

/**
 * Validates that redirect_uri is allowed for the client.
 */
export function isRedirectUriAllowed(
  client: RegisteredClient | undefined,
  redirectUri: string
): boolean {
  if (!redirectUri) return false;

  try {
    const url = new URL(redirectUri);

    // Allow localhost/127.0.0.1 for local dev/testing
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true;
    }

    // Allow official ChatGPT / OpenAI domains
    if (
      url.hostname === "chatgpt.com" ||
      url.hostname.endsWith(".chatgpt.com") ||
      url.hostname === "chat.openai.com" ||
      url.hostname === "platform.openai.com"
    ) {
      return true;
    }

    // Check against registered redirect URIs for this client
    if (client && client.redirectUris.includes(redirectUri)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Handler for GET /.well-known/oauth-protected-resource
 * RFC 8707 / draft-ietf-oauth-protected-resource-metadata
 */
export function getProtectedResourceMetadata(req: Request, res: Response): void {
  const baseUrl = getBaseUrl(req);
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  });
}

/**
 * Handler for GET /.well-known/oauth-authorization-server
 * RFC 8414 Authorization Server Metadata
 */
export function getAuthorizationServerMetadata(req: Request, res: Response): void {
  const baseUrl = getBaseUrl(req);
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["mcp"],
  });
}

/**
 * Handler for POST /oauth/register
 * RFC 7591 Dynamic Client Registration
 */
export function registerClientHandler(req: Request, res: Response): void {
  const { client_name, redirect_uris, grant_types, response_types } = req.body || {};

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "redirect_uris array is required",
    });
    return;
  }

  const clientId = `client_${crypto.randomUUID()}`;
  const clientSecret = `secret_${crypto.randomBytes(24).toString("hex")}`;

  const client: RegisteredClient = {
    clientId,
    clientSecret,
    clientName: client_name || "MCP Client",
    redirectUris: redirect_uris,
    grantTypes: grant_types || ["authorization_code", "refresh_token"],
    responseTypes: response_types || ["code"],
    createdAt: Date.now(),
  };

  clientsStore.set(clientId, client);
  logger.info(`Registered dynamic OAuth client: ${client.clientName}`, { clientId });

  res.status(201).json({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: "none",
  });
}

/**
 * Handler for GET /oauth/authorize and POST /oauth/authorize (consent flow)
 */
export function authorizeHandler(req: Request, res: Response): void {
  const clientId = (req.query.client_id || req.body?.client_id) as string;
  const redirectUri = (req.query.redirect_uri || req.body?.redirect_uri) as string;
  const responseType = (req.query.response_type || req.body?.response_type) as string;
  const codeChallenge = (req.query.code_challenge || req.body?.code_challenge) as string;
  const codeChallengeMethod = ((req.query.code_challenge_method || req.body?.code_challenge_method) as string) || "S256";
  const state = (req.query.state || req.body?.state) as string | undefined;
  const autoApprove = req.query.auto_approve === "true" || req.body?.approved === "true";

  // 1. Validate response_type
  if (responseType !== "code") {
    res.status(400).json({
      error: "unsupported_response_type",
      error_description: "Only response_type=code is supported",
    });
    return;
  }

  // 2. Validate client
  const client = clientsStore.get(clientId);
  if (!client && clientId !== DEFAULT_CHATGPT_CLIENT_ID) {
    res.status(400).json({
      error: "invalid_client",
      error_description: `Client '${clientId}' is not registered`,
    });
    return;
  }

  // 3. Validate redirect_uri
  if (!isRedirectUriAllowed(client, redirectUri)) {
    res.status(400).json({
      error: "invalid_request",
      error_description: `redirect_uri '${redirectUri}' is not authorized for this client`,
    });
    return;
  }

  // 4. Enforce PKCE (RFC 7636)
  if (!codeChallenge) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "code_challenge is required for PKCE",
    });
    return;
  }
  if (codeChallengeMethod !== "S256") {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Only code_challenge_method=S256 is supported",
    });
    return;
  }

  // 5. If consent not yet submitted and not auto-approved, render Consent UI
  if (req.method === "GET" && !autoApprove) {
    const clientName = client?.clientName || "ChatGPT Connector";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authorize ${clientName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1f2937; border-radius: 12px; padding: 32px; width: 100%; max-width: 440px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: #00e599; font-size: 24px; text-align: center; }
    p { color: #9ca3af; font-size: 15px; line-height: 1.5; text-align: center; }
    .scope-box { background: #111827; padding: 14px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #e5e7eb; border-left: 4px solid #00e599; }
    .btn { display: block; width: 100%; padding: 12px; background: #00e599; color: #064e3b; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 16px; text-align: center; text-decoration: none; }
    .btn:hover { background: #10b981; }
    .cancel { background: transparent; color: #9ca3af; margin-top: 10px; }
    .cancel:hover { color: #f3f4f6; background: transparent; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Authorize Access</h2>
    <p><strong>${clientName}</strong> is requesting permission to access your Model Context Protocol (MCP) server on Neon PostgreSQL.</p>
    <div class="scope-box">
      <strong>Scope: mcp</strong><br>
      • Create, read, update, delete, and search your personal records<br>
      • Query database and system status metrics
    </div>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="response_type" value="${responseType}">
      <input type="hidden" name="code_challenge" value="${codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">
      ${state ? `<input type="hidden" name="state" value="${state}">` : ""}
      <input type="hidden" name="approved" value="true">
      <button type="submit" class="btn">Allow & Connect</button>
    </form>
  </div>
</body>
</html>`);
    return;
  }

  // 6. Generate Authorization Code
  const code = `auth_${crypto.randomBytes(32).toString("hex")}`;
  const user: AuthenticatedUser = {
    userId: "00000000-0000-4000-a000-000000000001",
    email: "chatgpt-user@nitrocloud.mcp",
    name: "ChatGPT Authorized User",
  };

  authCodesStore.set(code, {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    user,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
  });

  const targetUrl = new URL(redirectUri);
  targetUrl.searchParams.set("code", code);
  if (state) {
    targetUrl.searchParams.set("state", state);
  }

  logger.info(`Issued OAuth code for client: ${clientId}`, { redirectUri });
  res.redirect(targetUrl.toString());
}

/**
 * Handler for POST /oauth/token
 * Supports grant_type=authorization_code (with PKCE verification) and refresh_token
 */
export function tokenHandler(req: Request, res: Response): void {
  // Support both JSON and application/x-www-form-urlencoded
  const grantType = req.body?.grant_type || req.query.grant_type;
  const code = req.body?.code || req.query.code;
  const redirectUri = req.body?.redirect_uri || req.query.redirect_uri;
  const clientId = req.body?.client_id || req.query.client_id;
  const codeVerifier = req.body?.code_verifier || req.query.code_verifier;

  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Supported grant_types are authorization_code and refresh_token",
    });
    return;
  }

  if (grantType === "authorization_code") {
    if (!code) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "code is required",
      });
      return;
    }

    const authCodeEntry = authCodesStore.get(code);
    if (!authCodeEntry) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired authorization code",
      });
      return;
    }

    // Invalidate code immediately (single use)
    authCodesStore.delete(code);

    if (Date.now() > authCodeEntry.expiresAt) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code has expired",
      });
      return;
    }

    if (clientId && clientId !== authCodeEntry.clientId) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "client_id does not match the authorization code",
      });
      return;
    }

    if (redirectUri && redirectUri !== authCodeEntry.redirectUri) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "redirect_uri does not match the authorization code",
      });
      return;
    }

    // Enforce PKCE verification
    if (!codeVerifier) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "code_verifier is required for PKCE",
      });
      return;
    }

    const isPkceValid = verifyCodeChallenge(
      codeVerifier,
      authCodeEntry.codeChallenge,
      authCodeEntry.codeChallengeMethod
    );

    if (!isPkceValid) {
      logger.warn("PKCE code_verifier verification failed", { clientId });
      res.status(400).json({
        error: "invalid_grant",
        error_description: "PKCE verification failed: invalid code_verifier",
      });
      return;
    }

    // Generate JWT access token
    const accessToken = signToken(authCodeEntry.user, "30d");
    const refreshToken = `ref_${crypto.randomBytes(32).toString("hex")}`;

    logger.info(`Issued OAuth access token for client: ${authCodeEntry.clientId}`, {
      userId: authCodeEntry.user.userId,
    });

    res.status(200).json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 3600,
      refresh_token: refreshToken,
      scope: "mcp",
    });
    return;
  }

  // Refresh token flow
  const accessToken = signToken(
    {
      userId: "00000000-0000-4000-a000-000000000001",
      email: "chatgpt-user@nitrocloud.mcp",
      name: "ChatGPT Authorized User",
    },
    "30d"
  );

  res.status(200).json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 30 * 24 * 3600,
    scope: "mcp",
  });
}
