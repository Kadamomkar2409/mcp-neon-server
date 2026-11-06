# ChatGPT Integration Evidence Checklist (PRD Section 9)

Use this checklist to record conversational test runs in real ChatGPT sessions connected to the deployed NitroCloud MCP server (`https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/mcp`).

Save screenshots of your ChatGPT session in [`docs/screenshots/`](file:///e:/Nitrostack/Task%20second/docs/screenshots/) and record the filenames in the table below.

---

## Section 9 Conversational Test Matrix

| # | Test Scenario | Exact Prompt to Send to ChatGPT | Expected ChatGPT Result | Status | Screenshot File (`docs/screenshots/`) |
|---|---|---|---|:---:|---|
| **1** | **Connect & Authenticate** | *(Configure connector in ChatGPT Settings with OAuth 2.0 PKCE or Bearer token)* | Connector connects successfully; OAuth consent page ("Authorize ChatGPT Connector") approves access. | [ ] | `docs/screenshots/01_connect_oauth.png` |
| **2** | **Tool Discovery** | *"What tools do you have available from the Neon database connector? List each tool name, describe what it does, and explain when it should be used."* | ChatGPT discovers and lists all 8 tools (`create_record`, `get_record`, `list_records`, `update_record`, `delete_record`, `search_records`, `get_database_stats`, `get_system_status`) with accurate "when to use" descriptions. | [ ] | `docs/screenshots/02_discover_tools.png` |
| **3** | **System & DB Health Check** | *"Check the current MCP system status and database health."* | ChatGPT calls `get_system_status`. Output shows `status: "OK"`, `transport: "streamable-http"`, and `database.status: "CONNECTED"` with live latency in ms. | [ ] | `docs/screenshots/03_system_status.png` |
| **4** | **Create Record** | *"Create a new record with title 'Production Deployment Audit v1', description 'Comprehensive architecture review for ChatGPT MCP on NitroCloud and Neon DB', and metadata with priority 'high' and environment 'production'."* | ChatGPT calls `create_record`. A new record is created in Neon; returns structured JSON with generated UUID and `createdAt` timestamp. | [ ] | `docs/screenshots/04_create_record.png` |
| **5** | **Retrieve Record (Get)** | *"Retrieve the record with ID '<paste-UUID-from-Test-4>'."* | ChatGPT calls `get_record`. Returns the exact record details (title, description, metadata) matching Neon database storage. | [ ] | `docs/screenshots/05_get_record.png` |
| **6** | **Update Record** | *"Update the record with ID '<paste-UUID-from-Test-4>': change title to 'Production Deployment Audit v1 (Verified)', update description to 'Verified end-to-end against live Neon PostgreSQL', and set 'signedOff: true' in metadata."* | ChatGPT calls `update_record`. The row in Neon is updated; returns refreshed `updatedAt` timestamp and updated fields. | [ ] | `docs/screenshots/06_update_record.png` |
| **7** | **Search Records** | *"Search my database records for the query 'Verified'."* | ChatGPT calls `search_records`. Successfully finds and displays the updated record matching the keyword. | [ ] | `docs/screenshots/07_search_records.png` |
| **8** | **List & Database Stats** | *"List all my records and show me my database statistics."* | ChatGPT calls `list_records` and `get_database_stats`. Returns paginated records and user vs system statistics from Neon. | [ ] | `docs/screenshots/08_stats_records.png` |
| **9** | **Delete Record** | *"Permanently delete the record with ID '<paste-UUID-from-Test-4>'."* | ChatGPT calls `delete_record`. The record is permanently deleted from Neon; returns `{ success: true, deletedRecordId: "..." }`. | [ ] | `docs/screenshots/09_delete_record.png` |
| **10** | **Verify Deletion** | *"Try to retrieve the record with ID '<paste-UUID-from-Test-4>' again."* | ChatGPT calls `get_record`. Server safely returns error: record was not found (404). ChatGPT explains the record no longer exists. | [ ] | `docs/screenshots/10_verify_deletion.png` |
| **11** | **Input Validation (Zod)** | *"Call the create_record tool with an empty title."* | Server rejects with MCP error `-32602`: `"Title must not be empty"`. ChatGPT catches the error and explains a non-empty title is required. | [ ] | `docs/screenshots/11_invalid_input.png` |
| **12** | **Unauthorized Request / Multi-Tenancy** | *"Try to retrieve record ID '11111111-2222-3333-4444-555555555555' or view another user's records."* | Service layer blocks request with `403 Forbidden` / `Not Found`. Cross-tenant data leakage is prevented. | [ ] | `docs/screenshots/12_unauthorized_access.png` |
| **13** | **Neon DB Failure Handling** | *(Temporarily suspend Neon compute or simulate DB timeout)*<br>*"Check database health and retrieve system status."* | Server catches timeout gracefully without crashing. ChatGPT reports database status as `DEGRADED` or `UNREACHABLE` with safe error message. | [ ] | `docs/screenshots/13_neon_failure.png` |
| **14** | **NitroCloud Restart & Reconnect** | *(Restart the service in NitroCloud dashboard)*<br>*"Run get_system_status and list my records."* | Stateless Streamable HTTP transport handles request immediately upon container restart. ChatGPT reconnects without needing connector reinstallation. | [ ] | `docs/screenshots/14_nitrocloud_restart.png` |

---

## Instructions for Taking & Filing Screenshots
1. Execute each prompt above in your real ChatGPT conversation with the NitroCloud connector enabled.
2. Capture a clear screenshot showing both your prompt and ChatGPT's response (including the tool invocation pill / output).
3. Save each screenshot to `docs/screenshots/<filename>` using the filename indicated in the right-hand column.
4. Check the box `[x]` for each test completed.
