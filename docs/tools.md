# MCP Tools Documentation

This document describes all 8 MCP tools provided by the Model Context Protocol server.

## Overview

All tools enforce strict authorization, parameter validation with Zod, and service-layer separation. Every tool invocation writes a structured audit log entry directly to the Neon PostgreSQL `audit_logs` table.

---

### 1. `create_record`
- **When to Use**: Use this tool to create a new user-owned record in the database when the user wants to store new structured or unstructured data, notes, items, or documents.
- **Access Control**: Authenticated user only (resolves user from JWT or `authToken`).
- **Input Parameters**:
  - `title` (`string`, required): Title of the record (1–255 characters).
  - `description` (`string`, optional): Optional markdown or text description.
  - `metadata` (`object`, optional): Structured JSON metadata.
  - `authToken` (`string`, optional): Optional Bearer token if not passed in HTTP header.
- **Output**: JSON payload with `success: true`, message, and created record details (`id`, `userId`, `title`, `description`, `metadata`, `createdAt`, `updatedAt`).

---

### 2. `get_record`
- **When to Use**: Use this tool to retrieve a specific record by its unique UUID ID when the user requests details, contents, or metadata of an existing record they own.
- **Access Control**: Owner only. Attempting to access another user's record returns `403 Forbidden`.
- **Input Parameters**:
  - `recordId` (`string`, UUID, required): The UUID of the record.
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: JSON payload containing the record.

---

### 3. `list_records`
- **When to Use**: Use this tool to browse or paginate through all records owned by the authenticated user, optionally filtering by title keyword or creation date range.
- **Access Control**: Returns only records owned by the authenticated user.
- **Input Parameters**:
  - `limit` (`integer`, optional, default 20, max 100): Number of records per page.
  - `offset` (`integer`, optional, default 0): Number of records to skip.
  - `titleFilter` (`string`, optional): Case-insensitive substring match on record title.
  - `createdAfter` (`string`, ISO date, optional): Filter records created on or after date.
  - `createdBefore` (`string`, ISO date, optional): Filter records created on or before date.
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: List of records and pagination metadata (`total`, `limit`, `offset`, `hasMore`).

---

### 4. `update_record`
- **When to Use**: Use this tool to update the title, description, or metadata of an existing record owned by the user. Only the record owner can update it.
- **Access Control**: Owner only. Attempting to update another user's record returns `403 Forbidden`.
- **Input Parameters**:
  - `recordId` (`string`, UUID, required): The UUID of the record to update.
  - `title` (`string`, optional): New title (1–255 chars).
  - `description` (`string`, optional): New description.
  - `metadata` (`object`, optional): Metadata to merge.
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: Updated record details with updated `updatedAt` timestamp.

---

### 5. `delete_record`
- **When to Use**: Use this tool to permanently remove an existing record from the database. Only the authorized owner of the record can delete it.
- **Access Control**: Owner only. Attempting to delete another user's record returns `403 Forbidden`.
- **Input Parameters**:
  - `recordId` (`string`, UUID, required): UUID of the record to delete.
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: `{ success: true, deletedRecordId, deletedAt }`.

---

### 6. `search_records`
- **When to Use**: Use this tool to search for keywords or phrases across record titles and descriptions owned by the user when looking for specific topics or content.
- **Access Control**: Scoped strictly to the authenticated user's records.
- **Input Parameters**:
  - `query` (`string`, required): Search keyword or phrase.
  - `limit` (`integer`, optional, default 20, max 100): Result limit.
  - `offset` (`integer`, optional, default 0): Result offset.
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: Matching records, query string, and `totalMatches`.

---

### 7. `get_database_stats`
- **When to Use**: Use this tool to inspect database metrics, including record counts, user-specific record statistics, activity over the last 24 hours, and Neon database connection health.
- **Access Control**: Authenticated users.
- **Input Parameters**:
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: User statistics (total user records, 24h count), aggregate system statistics (total records, users, audit logs), and database health (`latencyMs`, `healthy: true`).

---

### 8. `get_system_status`
- **When to Use**: Use this tool to check MCP server runtime health, platform information, memory usage, uptime, transport configuration, and real-time database connectivity.
- **Access Control**: Authenticated users.
- **Input Parameters**:
  - `authToken` (`string`, optional): Optional Bearer token.
- **Output**: Server status (`OK` / `DEGRADED`), Node version, memory usage, uptime, transport type (`streamable-http`), and live Neon DB status.

