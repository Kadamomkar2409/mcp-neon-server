import { signToken } from "../src/middleware/auth.js";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = "https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai";

// Generate a valid JWT token using local AUTH_SECRET
const validUser = {
  userId: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  email: "live-tester@example.com",
  name: "Live URL Tester",
};
const token = signToken(validUser, "1d");

console.log("Using Token:", token.slice(0, 30) + "...");

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
  return { status: res.status, data: json };
}

async function runLiveTests() {
  console.log("================================================================================");
  console.log("  1. VERIFYING LIVE /mcp ENDPOINT ON NITROCLOUD");
  console.log("================================================================================");

  // 1. Initialize
  console.log("\n[Test 1.1] initialize request...");
  const initRes = await postMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "live-test-client", version: "1.0.0" },
    },
  });
  console.log("Status:", initRes.status);
  console.log("Response:", JSON.stringify(initRes.data, null, 2));

  // 2. List Tools
  console.log("\n[Test 1.2] tools/list request...");
  const listToolsRes = await postMcp({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  console.log("Status:", listToolsRes.status);
  const tools = (listToolsRes.data as any)?.result?.tools;
  console.log("Tools discovered:", tools?.map((t: any) => t.name));

  // 3. Call get_system_status
  console.log("\n[Test 1.3] tools/call get_system_status...");
  const statusRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_system_status",
        arguments: {},
      },
    },
    token
  );
  console.log("Status:", statusRes.status);
  console.log("Response:", JSON.stringify(statusRes.data, null, 2));

  // 4. Create Record
  console.log("\n[Test 1.4] tools/call create_record...");
  const createRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "create_record",
        arguments: {
          title: "Live Cloud Verification Record",
          description: "Testing end-to-end NitroCloud -> Neon integration",
          metadata: { env: "nitrocloud-production", testRun: Date.now() },
        },
      },
    },
    token
  );
  console.log("Status:", createRes.status);
  console.log("Response:", JSON.stringify(createRes.data, null, 2));

  const textContent = (createRes.data as any)?.result?.content?.[0]?.text;
  let createdRecordId: string | undefined;
  if (textContent) {
    const parsed = JSON.parse(textContent);
    createdRecordId = parsed?.record?.id;
    console.log("Created Record ID in Neon:", createdRecordId);
  }

  if (!createdRecordId) {
    console.error("Failed to retrieve created record ID. Halting sequence.");
    return;
  }

  // 5. Get Record
  console.log(`\n[Test 1.5] tools/call get_record for ${createdRecordId}...`);
  const getRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "get_record",
        arguments: {
          recordId: createdRecordId,
        },
      },
    },
    token
  );
  console.log("Status:", getRes.status);
  console.log("Response:", JSON.stringify(getRes.data, null, 2));

  // 6. Update Record
  console.log(`\n[Test 1.6] tools/call update_record for ${createdRecordId}...`);
  const updateRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "update_record",
        arguments: {
          recordId: createdRecordId,
          title: "Live Cloud Verification Record (Updated)",
          description: "Updated successfully in Neon PostgreSQL from NitroCloud",
        },
      },
    },
    token
  );
  console.log("Status:", updateRes.status);
  console.log("Response:", JSON.stringify(updateRes.data, null, 2));

  // 7. Search Records
  console.log("\n[Test 1.7] tools/call search_records for query 'Verification'...");
  const searchRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "search_records",
        arguments: {
          query: "Verification",
        },
      },
    },
    token
  );
  console.log("Status:", searchRes.status);
  console.log("Response:", JSON.stringify(searchRes.data, null, 2));

  // 8. Delete Record
  console.log(`\n[Test 1.8] tools/call delete_record for ${createdRecordId}...`);
  const deleteRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "delete_record",
        arguments: {
          recordId: createdRecordId,
        },
      },
    },
    token
  );
  console.log("Status:", deleteRes.status);
  console.log("Response:", JSON.stringify(deleteRes.data, null, 2));

  // 9. Verify Delete
  console.log(`\n[Test 1.9] tools/call get_record (confirming deletion) for ${createdRecordId}...`);
  const verifyDeleteRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "get_record",
        arguments: {
          recordId: createdRecordId,
        },
      },
    },
    token
  );
  console.log("Status:", verifyDeleteRes.status);
  console.log("Response:", JSON.stringify(verifyDeleteRes.data, null, 2));

  console.log("================================================================================");
  console.log("  2. TESTING INVALID INPUT & UNAUTHORIZED REQUESTS");
  console.log("================================================================================");

  // 10. Invalid Input (Empty Title on create_record)
  console.log("\n[Test 2.1] Invalid Input: create_record with empty title...");
  const invalidInputRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "create_record",
        arguments: {
          title: "",
        },
      },
    },
    token
  );
  console.log("Status:", invalidInputRes.status);
  console.log("Response:", JSON.stringify(invalidInputRes.data, null, 2));

  // 11. Unauthorized Request: Invalid JWT Token
  console.log("\n[Test 2.2] Unauthorized Request: Invalid Bearer Token...");
  const invalidTokenRes = await postMcp(
    {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "get_system_status",
        arguments: {},
      },
    },
    "invalid.bearer.token"
  );
  console.log("Status:", invalidTokenRes.status);
  console.log("Response:", JSON.stringify(invalidTokenRes.data, null, 2));

  // 12. Unauthorized Request: Missing Token
  console.log("\n[Test 2.3] Unauthorized Request: Missing Token...");
  const missingTokenRes = await postMcp({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: {
      name: "create_record",
      arguments: {
        title: "Should Fail Without Token",
      },
    },
  });
  console.log("Status:", missingTokenRes.status);
  console.log("Response:", JSON.stringify(missingTokenRes.data, null, 2));
}

runLiveTests().catch(console.error);
