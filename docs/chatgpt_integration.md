# ChatGPT Integration & Validation Guide (PRD Section 9)

This guide walks you through connecting your deployed MCP server on NitroCloud to **ChatGPT** via either **OAuth 2.0 (PKCE)** or **Bearer Token**, followed by the complete Section 9 verification script to execute in real ChatGPT conversations.

---

## Live NitroCloud Endpoint Reference

- **Base URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai`
- **MCP Endpoint**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/mcp`
- **Health Check**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/health`
- **Protected Resource Metadata (RFC 8707)**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/.well-known/oauth-protected-resource`
- **OAuth 2.0 Authorization Server Metadata (RFC 8414)**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/.well-known/oauth-authorization-server`
- **OAuth Authorize Endpoint**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/authorize`
- **OAuth Token Endpoint**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/token`
- **Dynamic Registration Endpoint (RFC 7591)**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/register`

---

## Part 1: Adding the MCP Server to ChatGPT

### Method A: OAuth 2.0 (Recommended – Automatic Discovery & PKCE)

1. Open **ChatGPT** and go to **Settings** > **Connected Apps** / **Connectors** (or **Developer Settings** > **MCP Servers** / **Actions**).
2. Click **Add Server** or **Create Connector**.
3. Enter the MCP Endpoint:
   ```
   https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/mcp
   ```
4. Choose **OAuth 2.0** as the authentication type:
   - **Discovery / Authorization Server**: Automatically detected from `/.well-known/oauth-protected-resource` via the `WWW-Authenticate` header.
   - If manual input is prompted:
     - **Authorization URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/authorize`
     - **Token URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/token`
     - **Client ID**: `chatgpt` (or dynamic registration via `/oauth/register`)
     - **PKCE**: Enabled (`S256`)
     - **Scope**: `mcp`
5. Click **Connect**.
6. A popup window opens displaying the server consent page:
   - Title: **Authorize ChatGPT Connector**
   - Scope: **mcp** (CRUD personal records, database metrics)
7. Click **Allow & Connect**. ChatGPT exchanges the PKCE code and connects successfully.
8. ChatGPT runs the MCP `initialize` and `tools/list` handshake and discovers all 8 tools:
   - `create_record`
   - `get_record`
   - `list_records`
   - `update_record`
   - `delete_record`
   - `search_records`
   - `get_database_stats`
   - `get_system_status`

---

### Method B: Manual Bearer Token Authentication

If your ChatGPT plan/connector UI provides a direct **Bearer Token / API Key** field:

1. Generate a valid token locally:
   ```bash
   npm run token
   ```
2. In ChatGPT connector settings:
   - **Server URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/mcp`
   - **Authentication**: `Bearer Token`
   - **Token**: `<paste the output token from npm run token>`
3. Click **Save & Connect**.

---

## Part 2: PRD Section 9 Conversational Test Script

Open a fresh conversation in ChatGPT with the **Neon MCP Server** connector enabled. Run the following prompts in order.

---

### Test 1: Tool Discovery & Protocol Verification
**Prompt to ChatGPT**:
> "What tools do you have available from the Neon database connector? List each tool name, describe what it does, and explain when it should be used."

**Expected Result**:
- ChatGPT lists all 8 registered tools without hallucinating extras.
- Descriptions match the "WHEN to use" specifications in the PRD (e.g., `create_record`, `get_record`, `list_records`, `update_record`, `delete_record`, `search_records`, `get_database_stats`, `get_system_status`).

---

### Test 2: System Health & Database Connectivity
**Prompt to ChatGPT**:
> "Check the current MCP system status and database health."

**Expected Result**:
- ChatGPT invokes `get_system_status`.
- Tool returns:
  - `status: "OK"`
  - `transport: "streamable-http"`
  - `database.status: "CONNECTED"`
  - Live latency in milliseconds (typically 50-700ms).
- ChatGPT reports that both the MCP server and Neon PostgreSQL are healthy and running in production.

---

### Test 3: Full Lifecycle – Create -> Get -> Update -> Search -> Delete

#### Step 3A: Create Record
**Prompt to ChatGPT**:
> "Create a new record with the title 'Production Deployment Audit v1', description 'Comprehensive architecture review for ChatGPT MCP on NitroCloud and Neon DB', and metadata with priority 'high' and environment 'production'."

**Expected Result**:
- ChatGPT invokes `create_record` with valid arguments.
- Server returns a structured JSON response confirming creation.
- A new UUID is assigned to the record (e.g., `c4a5b6d7-...`).
- **Note down the returned Record ID** for subsequent steps.

#### Step 3B: Retrieve Record (Get)
**Prompt to ChatGPT**:
> "Retrieve the record with ID '<paste-record-id-from-step-3A>'."

**Expected Result**:
- ChatGPT invokes `get_record`.
- Returns title, description, metadata, and timestamps matching what was created in Neon.

#### Step 3C: Update Record
**Prompt to ChatGPT**:
> "Update the record with ID '<paste-record-id-from-step-3A>': change the title to 'Production Deployment Audit v1 (Verified)', update description to 'Verified end-to-end against live Neon PostgreSQL', and add 'signedOff: true' to metadata."

**Expected Result**:
- ChatGPT invokes `update_record`.
- Returns updated record with refreshed `updatedAt` timestamp and updated fields.

#### Step 3D: Search Records
**Prompt to ChatGPT**:
> "Search my database records for the query 'Verified'."

**Expected Result**:
- ChatGPT invokes `search_records`.
- Finds and displays the updated record matching the keyword query.

#### Step 3E: List Records & Database Statistics
**Prompt to ChatGPT**:
> "List all my records and show me my database statistics."

**Expected Result**:
- ChatGPT invokes `list_records` with pagination and `get_database_stats`.
- Displays total records owned by your authenticated user, total records in system, and recent creation metrics.

#### Step 3F: Delete Record
**Prompt to ChatGPT**:
> "Permanently delete the record with ID '<paste-record-id-from-step-3A>'."

**Expected Result**:
- ChatGPT invokes `delete_record`.
- Server deletes the row from Neon and returns confirmation: `{ success: true, deletedRecordId: "..." }`.

#### Step 3G: Verify Deletion
**Prompt to ChatGPT**:
> "Try to retrieve the record with ID '<paste-record-id-from-step-3A>' again."

**Expected Result**:
- ChatGPT invokes `get_record`.
- Server returns a safe error: `"Record '<id>' was not found"`.
- ChatGPT clearly explains that the record no longer exists.

---

### Test 4: Input Validation (Zod Schema Rejection)
**Prompt to ChatGPT**:
> "Call the create_record tool with an empty title."

**Expected Result**:
- ChatGPT submits `{ title: "" }`.
- Server returns MCP error code `-32602` (Input validation error): `"Title must not be empty"`.
- ChatGPT catches the validation error and instructs you that a non-empty title is required.

---

### Test 5: Multi-Tenancy & Authorization Boundary
**Prompt to ChatGPT**:
> "Try to retrieve record ID '11111111-2222-3333-4444-555555555555' or fetch another user's records."

**Expected Result**:
- The service layer checks ownership: either returns 404 (not found) or 403 (Forbidden: User does not have access to this record).
- Cross-tenant data leakage is strictly blocked.

---

### Test 6: Neon Failure & Reconnect Resilience
1. In your Neon Console, temporarily pause compute or change the connection password in NitroCloud to simulate an outage.
2. **Prompt to ChatGPT**:
   > "Check database health and retrieve system status."
3. **Expected Result**:
   - ChatGPT invokes `get_system_status` or `get_database_stats`.
   - The server catches the database timeout/failure safely without crashing the Node.js process.
   - ChatGPT reports database status as `DEGRADED` or `UNREACHABLE`.
4. Restore compute / fix password.
5. **Prompt to ChatGPT**:
   > "Try checking the system status again."
6. **Expected Result**:
   - Connection recovers automatically.
   - Status returns to `OK` and `CONNECTED`.

---

### Test 7: NitroCloud Restart & Session Recovery
1. In your NitroCloud dashboard, trigger a restart / redeploy of the service.
2. Wait 15 seconds for the container to boot.
3. In ChatGPT:
   > "Run get_system_status and list my records."
4. **Expected Result**:
   - The stateless Streamable HTTP transport handles the request immediately upon restart.
   - ChatGPT reconnects without requiring connector re-installation or re-authentication.

---

## Part 3: What to Capture for PRD Submission

During your ChatGPT conversation, take screenshots or copy logs for:
1. **Connector Configuration**: Screenshot showing the connector added and connected.
2. **Consent Flow**: Screenshot of the OAuth consent popup / authorization approval.
3. **Tool Discovery**: Screenshot of ChatGPT listing all 8 tools with descriptions.
4. **CRUD Cycle**: Screenshot showing create, retrieve, update, search, and delete sequence.
5. **Validation Error**: Screenshot of ChatGPT handling the empty title validation error.
6. **Audit Logs in Neon**: Query `audit_logs` in the Neon SQL Editor to show real audit entries created by ChatGPT's tool calls:
   ```sql
   SELECT tool_name, action, status, created_at 
   FROM audit_logs 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
