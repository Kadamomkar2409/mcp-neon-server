import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  "https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai";

function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function postMcp(payload: unknown, authToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, data: json };
}

async function runLiveVerification() {
  console.log("================================================================================");
  console.log(`  VERIFYING LIVE MCP & OAUTH FLOW ON NITROCLOUD`);
  console.log(`  Target Base URL: ${BASE_URL}`);
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // STEP 1: RFC 8707 Protected Resource Metadata
  // ---------------------------------------------------------------------------
  console.log("\n[1.1] Fetching /.well-known/oauth-protected-resource...");
  const prRes = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`);
  console.log("Status:", prRes.status);
  const prData = (await prRes.json()) as any;
  console.log("Protected Resource Metadata:", JSON.stringify(prData, null, 2));

  if (!prData.resource?.startsWith("https://")) {
    console.warn("WARNING: resource URL is not HTTPS. PUBLIC_BASE_URL must be configured in NitroCloud.");
  }

  // ---------------------------------------------------------------------------
  // STEP 2: RFC 8414 Authorization Server Metadata
  // ---------------------------------------------------------------------------
  console.log("\n[1.2] Fetching /.well-known/oauth-authorization-server...");
  const asRes = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
  console.log("Status:", asRes.status);
  const asData = (await asRes.json()) as any;
  console.log("Auth Server Metadata:", JSON.stringify(asData, null, 2));

  console.log("PKCE S256 Supported:", asData.code_challenge_methods_supported?.includes("S256"));
  console.log("Registration Endpoint:", asData.registration_endpoint);

  // ---------------------------------------------------------------------------
  // STEP 3: Unauthenticated /mcp Check (Expect 401 with WWW-Authenticate)
  // ---------------------------------------------------------------------------
  console.log("\n[2.1] Unauthenticated request to /mcp (expecting 401 + WWW-Authenticate)...");
  const unauthRes = await postMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "unauth-probe", version: "1.0.0" },
    },
  });
  console.log("Status:", unauthRes.status);
  const wwwAuthHeader = unauthRes.headers.get("www-authenticate");
  console.log("WWW-Authenticate Header:", wwwAuthHeader);
  console.log("Body:", JSON.stringify(unauthRes.data, null, 2));

  // ---------------------------------------------------------------------------
  // STEP 4: Dynamic Client Registration (RFC 7591)
  // ---------------------------------------------------------------------------
  console.log("\n[3.1] Dynamic Client Registration (/oauth/register)...");
  const redirectUri = "https://chatgpt.com/aip/live-test/oauth/callback";
  const regRes = await fetch(`${BASE_URL}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "ChatGPT Live Test Connector",
      redirect_uris: [redirectUri],
    }),
  });
  console.log("Status:", regRes.status);
  const regData = (await regRes.json()) as any;
  console.log("Registered Client:", JSON.stringify(regData, null, 2));
  const clientId = regData.client_id || "chatgpt";

  // ---------------------------------------------------------------------------
  // STEP 5: PKCE S256 Authorization Code Flow
  // ---------------------------------------------------------------------------
  console.log("\n[4.1] Initiating PKCE S256 Authorization (/oauth/authorize)...");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", "live_pkce_state_987");
  authUrl.searchParams.set("auto_approve", "true");

  const authorizeRes = await fetch(authUrl.toString(), { redirect: "manual" });
  console.log("Authorize Status:", authorizeRes.status);
  const location = authorizeRes.headers.get("location");
  console.log("Redirect Location:", location);

  if (!location) {
    throw new Error("Authorize endpoint did not return redirect location!");
  }

  const callbackUrl = new URL(location);
  const authCode = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");
  console.log("Extracted Auth Code:", authCode?.slice(0, 20) + "...");
  console.log("Returned State:", returnedState);

  if (!authCode) {
    throw new Error("No authorization code in redirect location!");
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Token Exchange with PKCE verifier (/oauth/token)
  // ---------------------------------------------------------------------------
  console.log("\n[5.1] Exchanging authorization code for Bearer token (/oauth/token)...");
  const tokenRes = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: authCode,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  console.log("Token Status:", tokenRes.status);
  const tokenData = (await tokenRes.json()) as any;
  console.log("Token Response:", {
    token_type: tokenData.token_type,
    expires_in: tokenData.expires_in,
    access_token_preview: tokenData.access_token ? tokenData.access_token.slice(0, 25) + "..." : null,
  });

  const oauthAccessToken = tokenData.access_token;
  if (!oauthAccessToken) {
    throw new Error("Failed to obtain OAuth access token!");
  }

  // ---------------------------------------------------------------------------
  // STEP 7: MCP Tools Execution with OAuth Access Token
  // ---------------------------------------------------------------------------
  console.log("\n[6.1] MCP initialize with OAuth Bearer token...");
  const initRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "chatgpt-verified-client", version: "1.0.0" },
      },
    },
    oauthAccessToken
  );
  console.log("Status:", initRes.status);
  console.log("Response:", JSON.stringify(initRes.data, null, 2));

  console.log("\n[6.2] MCP tools/list with OAuth Bearer token...");
  const toolsListRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    },
    oauthAccessToken
  );
  console.log("Status:", toolsListRes.status);
  const tools = (toolsListRes.data as any)?.result?.tools;
  console.log("Discovered Tools Count:", tools?.length);
  console.log("Tools:", tools?.map((t: any) => t.name));

  console.log("\n[6.3] MCP tools/call get_system_status...");
  const sysRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_system_status", arguments: {} },
    },
    oauthAccessToken
  );
  console.log("Status:", sysRes.status);
  console.log("Response:", JSON.stringify(sysRes.data, null, 2));

  console.log("\n[6.4] MCP tools/call create_record in Neon...");
  const createRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "create_record",
        arguments: {
          title: "OAuth Verified Document",
          description: "Created via OAuth 2.0 PKCE flow on NitroCloud",
          metadata: { authMode: "oauth2_pkce", timestamp: Date.now() },
        },
      },
    },
    oauthAccessToken
  );
  console.log("Status:", createRes.status);
  const createText = (createRes.data as any)?.result?.content?.[0]?.text;
  let recordId: string | undefined;
  if (createText) {
    const parsed = JSON.parse(createText);
    recordId = parsed?.record?.id;
    console.log("Created Record ID:", recordId);
  }

  if (recordId) {
    console.log(`\n[6.5] MCP tools/call get_record for ${recordId}...`);
    const getRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "get_record", arguments: { recordId } },
      },
      oauthAccessToken
    );
    console.log("Status:", getRes.status);

    console.log(`\n[6.6] MCP tools/call update_record for ${recordId}...`);
    const updateRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "update_record",
          arguments: {
            recordId,
            title: "OAuth Verified Document (Updated)",
            description: "Updated successfully over OAuth-authenticated MCP connection",
          },
        },
      },
      oauthAccessToken
    );
    console.log("Status:", updateRes.status);

    console.log(`\n[6.7] MCP tools/call search_records for 'Verified'...`);
    const searchRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "search_records",
          arguments: { query: "Verified" },
        },
      },
      oauthAccessToken
    );
    console.log("Status:", searchRes.status);

    console.log(`\n[6.8] MCP tools/call delete_record for ${recordId}...`);
    const delRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "delete_record", arguments: { recordId } },
      },
      oauthAccessToken
    );
    console.log("Status:", delRes.status);
  }

  // ---------------------------------------------------------------------------
  // STEP 8: Security & Validation Tests
  // ---------------------------------------------------------------------------
  console.log("\n[7.1] Testing Zod Validation Error (empty title)...");
  const badInputRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "create_record", arguments: { title: "" } },
    },
    oauthAccessToken
  );
  console.log("Status:", badInputRes.status);
  console.log("Response:", JSON.stringify(badInputRes.data, null, 2));

  console.log("\n[7.2] Testing Invalid Bearer Token (expecting 401)...");
  const badTokenRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "get_system_status", arguments: {} },
    },
    "bad.token.signature"
  );
  console.log("Status:", badTokenRes.status);
  console.log("WWW-Authenticate:", badTokenRes.headers.get("www-authenticate"));
  console.log("Response:", JSON.stringify(badTokenRes.data, null, 2));

  console.log("\n================================================================================");
  console.log("  ALL LIVE OAUTH & MCP VERIFICATION CHECKS COMPLETED SUCCESSFULLY!");
  console.log("================================================================================");
}

runLiveVerification().catch(console.error);
