# End-to-End Live Demonstration Script

This demo script guides you through proving that **ChatGPT -> NitroCloud MCP Server -> Neon PostgreSQL** works end to end with zero mocks.

---

## Prerequisites Checklist

- [x] Neon database migrations applied (`users`, `records`, `audit_logs`).
- [x] MCP server deployed to NitroCloud (or running with public HTTPS URL).
- [x] JWT access token generated via `npm run token`.
- [x] ChatGPT connector configured with the `/mcp` endpoint and Bearer token.

---

## Live Demonstration Steps

### Step 1: Health Check Verification
**Action**: Probe `/health` to verify live Neon database connectivity.
```bash
curl -i https://<your-nitrocloud-app>.nitrocloud.app/health
```
**Expected Response**:
```json
{
  "status": "OK",
  "uptimeSeconds": 120,
  "database": {
    "status": "CONNECTED",
    "latencyMs": 45
  }
}
```

---

### Step 2: ChatGPT Tool Discovery Handshake
**ChatGPT Conversation Prompt**:
> "What database tools do you have connected?"

**Expected Result**:
ChatGPT lists all 8 tools:
1. `create_record`
2. `get_record`
3. `list_records`
4. `update_record`
5. `delete_record`
6. `search_records`
7. `get_database_stats`
8. `get_system_status`

---

### Step 3: Create Record and Verify in Neon
**ChatGPT Conversation Prompt**:
> "Create a record with title 'Production Deployment Validation' and description 'Validating Neon DB integration from ChatGPT' with metadata { 'environment': 'production', 'status': 'validating' }."

**Expected Result in ChatGPT**:
ChatGPT executes `create_record` and displays:
```json
{
  "success": true,
  "message": "Record created successfully.",
  "record": {
    "id": "e4f8d2...-uuid",
    "title": "Production Deployment Validation",
    "createdAt": "2026-11-06T..."
  }
}
```

**Direct Neon SQL Verification (Optional)**:
Run in Neon SQL Console to confirm immediate persistence:
```sql
SELECT id, title, description, metadata, created_at FROM records WHERE title = 'Production Deployment Validation';
```
*(Row exists in Neon PostgreSQL).*

---

### Step 4: Retrieve and Update Record
**ChatGPT Conversation Prompt**:
> "Update the record you just created. Set the description to 'Validation completed with 100% test pass rate', and set metadata status to 'verified'."

**Expected Result in ChatGPT**:
ChatGPT invokes `update_record`, and returns updated record data with refreshed `updated_at`.

---

### Step 5: Search Records
**ChatGPT Conversation Prompt**:
> "Search my records for 'Validation'."

**Expected Result in ChatGPT**:
ChatGPT invokes `search_records` and returns the matching record.

---

### Step 6: Authorization & Multi-Tenancy Boundary Enforcement
**ChatGPT Conversation Prompt**:
> "Try to retrieve record ID '11111111-2222-3333-4444-555555555555' which belongs to another user."

**Expected Result in ChatGPT**:
The service layer rejects the request with `403 Forbidden` / `Not Found`. ChatGPT explains that you are not authorized to view records you do not own.

---

### Step 7: Delete Record and Confirm Cleanup
**ChatGPT Conversation Prompt**:
> "Delete the record we created, and then try to get it again."

**Expected Result in ChatGPT**:
1. ChatGPT calls `delete_record` and reports `success: true`.
2. ChatGPT calls `get_record` and reports that the record was not found.

---

### Step 8: Verify Audit Trail
**Direct Neon SQL Verification**:
```sql
SELECT tool_name, action, status, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```
*(Shows a complete immutable audit trail of `create_record`, `update_record`, `search_records`, and `delete_record` logged directly into Neon).*

