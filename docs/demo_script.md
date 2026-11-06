# End-to-End Live Demonstration Script (PRD Section 14)

This script is designed for a live walkthrough demonstrating that the **ChatGPT -> NitroCloud MCP Server -> Neon PostgreSQL** stack functions end-to-end with real database persistence, strict authorization, and zero mock data.

---

## Prerequisites
1. Server is deployed and running on NitroCloud: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai`.
2. Database migrations are applied on Neon PostgreSQL.
3. Connector is configured in ChatGPT with OAuth 2.0 PKCE or Bearer token.
4. Have the **Neon Console SQL Editor** open in a separate browser tab to verify immediate SQL changes.

---

## Demonstration Script

### Step 1: Prove System Health & Connectivity
**ChatGPT Prompt**:
> "Check the current MCP system status and database health."

**Expected Output**:
- ChatGPT invokes `get_system_status`.
- Shows `status: "OK"`, `transport: "streamable-http"`, and `database.status: "CONNECTED"` with real-time latency in milliseconds.
- Proves the MCP server is live on NitroCloud and communicating with Neon PostgreSQL.

---

### Step 2: Tool Discovery
**ChatGPT Prompt**:
> "What database tools do you have available? List their names and brief descriptions."

**Expected Output**:
- ChatGPT lists all 8 tools: `create_record`, `get_record`, `list_records`, `update_record`, `delete_record`, `search_records`, `get_database_stats`, `get_system_status`.
- Explains when each tool should be used.

---

### Step 3: Create Record & Verify in Neon
**ChatGPT Prompt**:
> "Create a new record with the title 'Demonstration Audit Record', description 'Created during the PRD Section 14 live demo walkthrough', and metadata { 'demo': true, 'reviewer': 'Evaluator', 'priority': 'high' }."

**Expected Output in ChatGPT**:
- ChatGPT invokes `create_record`.
- Returns confirmation with the newly generated record UUID (e.g. `d7a8b9c0-1111-2222-3333-444455556666`) and `createdAt` timestamp.
- **Copy this UUID for the next steps.**

**Direct SQL Verification in Neon Console**:
```sql
SELECT id, title, description, metadata, created_at 
FROM records 
WHERE title = 'Demonstration Audit Record';
```
*(Verify row exists immediately in the database with the exact fields provided).*

---

### Step 4: Retrieve and Update Record
**ChatGPT Prompt**:
> "Update the record with ID '<paste-UUID>': change the title to 'Demonstration Audit Record (Verified)', update description to 'Live update confirmed in Neon PostgreSQL', and add 'status': 'completed' in the metadata."

**Expected Output in ChatGPT**:
- ChatGPT invokes `update_record`.
- Returns the updated record showing the modified title, description, and refreshed `updatedAt` timestamp.

**Direct SQL Verification in Neon Console**:
```sql
SELECT title, description, metadata, updated_at 
FROM records 
WHERE id = '<paste-UUID>';
```
*(Verify title and description updated and updated_at > created_at).*

---

### Step 5: Search Records
**ChatGPT Prompt**:
> "Search my records for the keyword 'confirmed'."

**Expected Output in ChatGPT**:
- ChatGPT invokes `search_records`.
- Finds and displays the updated record matching the keyword query.

---

### Step 6: Multi-Tenancy & Authorization Boundary
**ChatGPT Prompt**:
> "Try to retrieve record ID '00000000-0000-0000-0000-000000000000' or view another user's records."

**Expected Output in ChatGPT**:
- The service layer enforces user ownership and rejects cross-tenant access.
- ChatGPT safely reports that the record was not found or access is forbidden, with zero internal stack traces or leaked records.

---

### Step 7: Input Validation Error Handling
**ChatGPT Prompt**:
> "Call create_record with an empty title."

**Expected Output in ChatGPT**:
- The server's Zod schema intercepts the request and returns MCP error code `-32602`.
- ChatGPT reports: *"Title must not be empty"*.

---

### Step 8: Delete Record & Confirm Deletion
**ChatGPT Prompt**:
> "Permanently delete the record with ID '<paste-UUID>', then try to get it again."

**Expected Output in ChatGPT**:
1. ChatGPT calls `delete_record`. Server returns `{ success: true, deletedRecordId: "..." }`.
2. ChatGPT calls `get_record` on the same ID. Server returns 404 / record not found.
3. ChatGPT confirms the record is permanently deleted.

**Direct SQL Verification in Neon Console**:
```sql
SELECT * FROM records WHERE id = '<paste-UUID>';
```
*(Returns 0 rows).*

---

### Step 9: Verify Real Audit Log Trail
**Direct SQL Verification in Neon Console**:
```sql
SELECT tool_name, action, status, created_at 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 6;
```
**Expected Result**:
Shows consecutive audit entries created during the demonstration:
- `delete_record` | `DELETE` | `SUCCESS`
- `create_record` | `CREATE` | `FAILURE` (or validation error)
- `search_records` | `SEARCH` | `SUCCESS`
- `update_record` | `UPDATE` | `SUCCESS`
- `create_record` | `CREATE` | `SUCCESS`
- `get_system_status` | `SYSTEM_STATUS` | `SUCCESS`
