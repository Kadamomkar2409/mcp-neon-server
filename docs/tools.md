# MCP Tools Documentation (All 8 Tools)

This document provides the reference manual for all 8 Model Context Protocol (MCP) tools implemented in this server. Every tool is registered with the MCP SDK, validates arguments using Zod, enforces authorization, delegates business logic to the service layer, and writes structured audit logs to Neon PostgreSQL.

---

## Tool 1: `create_record`

- **Purpose**: Creates a new user-owned record in the database.
- **When to Use**: Call this tool when the user wants to store a new note, document, research item, or structured record in their database account.
- **Authorization**: Authenticated user. The record is automatically linked to the caller's `user_id`.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255,
      "description": "The title of the record (cannot be empty)."
    },
    "description": {
      "type": "string",
      "description": "Optional detailed text or markdown description."
    },
    "metadata": {
      "type": "object",
      "description": "Optional arbitrary JSON object with custom key-value pairs.",
      "default": {}
    },
    "authToken": {
      "type": "string",
      "description": "Optional JWT token if not passed in the HTTP Authorization header."
    }
  },
  "required": ["title"]
}
```

### Example Tool Output
```json
{
  "success": true,
  "message": "Record created successfully.",
  "record": {
    "id": "e4f8d2b1-4c6e-48a3-9b2f-7a1c3d5e9f01",
    "userId": "00000000-0000-4000-a000-000000000001",
    "title": "Quarterly Architecture Plan",
    "description": "Core specifications for Q4 deployment",
    "metadata": { "priority": "high", "env": "production" },
    "createdAt": "2026-11-06T18:30:00.000Z",
    "updatedAt": "2026-11-06T18:30:00.000Z"
  }
}
```

### Errors & Failure Modes
- **`-32602` (Input Validation Error)**: Returned when `title` is empty or missing (`"Title must not be empty"`).
- **`-32000` (Unauthorized)**: Returned when no valid Bearer token or `authToken` is supplied.
- **`-32603` (Internal Server Error)**: Returned if the database query fails.

---

## Tool 2: `get_record`

- **Purpose**: Retrieves a single record by its unique UUID.
- **When to Use**: Call this tool when the user asks to see, read, or inspect the contents and metadata of a specific existing record by its identifier.
- **Authorization**: Owner only. Users can only retrieve records matching their own `userId`.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "recordId": {
      "type": "string",
      "format": "uuid",
      "description": "The UUID of the record to retrieve."
    },
    "authToken": {
      "type": "string",
      "description": "Optional JWT token if not passed in HTTP header."
    }
  },
  "required": ["recordId"]
}
```

### Example Tool Output
```json
{
  "success": true,
  "record": {
    "id": "e4f8d2b1-4c6e-48a3-9b2f-7a1c3d5e9f01",
    "userId": "00000000-0000-4000-a000-000000000001",
    "title": "Quarterly Architecture Plan",
    "description": "Core specifications for Q4 deployment",
    "metadata": { "priority": "high", "env": "production" },
    "createdAt": "2026-11-06T18:30:00.000Z",
    "updatedAt": "2026-11-06T18:30:00.000Z"
  }
}
```

### Errors & Failure Modes
- **`-32602` (Validation Error)**: Returned if `recordId` is not a valid UUID string.
- **`Record not found` (404)**: Returned if no record with that UUID exists.
- **`Forbidden` (403)**: Returned if the record exists but is owned by a different user.

---

## Tool 3: `list_records`

- **Purpose**: Lists and paginates through records belonging to the authenticated user.
- **When to Use**: Call this tool when the user asks to browse their records, see what is saved, or filter records by date or title keywords.
- **Authorization**: Authenticated user. Results are automatically scoped to the user's records.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20,
      "description": "Maximum number of records to return per page (1–100)."
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "default": 0,
      "description": "Number of records to skip for pagination."
    },
    "titleFilter": {
      "type": "string",
      "description": "Optional substring to filter record titles (case-insensitive)."
    },
    "createdAfter": {
      "type": "string",
      "format": "date-time",
      "description": "Optional ISO 8601 timestamp to filter records created on or after this time."
    },
    "createdBefore": {
      "type": "string",
      "format": "date-time",
      "description": "Optional ISO 8601 timestamp to filter records created on or before this time."
    },
    "authToken": {
      "type": "string",
      "description": "Optional JWT token."
    }
  }
}
```

### Example Tool Output
```json
{
  "success": true,
  "records": [
    {
      "id": "e4f8d2b1-4c6e-48a3-9b2f-7a1c3d5e9f01",
      "title": "Quarterly Architecture Plan",
      "description": "Core specifications for Q4 deployment",
      "metadata": { "priority": "high" },
      "createdAt": "2026-11-06T18:30:00.000Z",
      "updatedAt": "2026-11-06T18:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### Errors & Failure Modes
- **`-32602`**: Returned if `limit` exceeds 100 or is negative, or if date formats are invalid.
- **`-32000`**: Returned if the request is unauthenticated.

---

## Tool 4: `update_record`

- **Purpose**: Modifies the title, description, or metadata of an existing record.
- **When to Use**: Call this tool when the user wants to edit, update, or append information to a record they previously created.
- **Authorization**: Owner only. Users cannot update records owned by others.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "recordId": {
      "type": "string",
      "format": "uuid",
      "description": "The UUID of the record to update."
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255,
      "description": "New title for the record."
    },
    "description": {
      "type": "string",
      "description": "New description for the record."
    },
    "metadata": {
      "type": "object",
      "description": "Updated metadata object."
    },
    "authToken": {
      "type": "string",
      "description": "Optional JWT token."
    }
  },
  "required": ["recordId"]
}
```

### Example Tool Output
```json
{
  "success": true,
  "message": "Record updated successfully.",
  "record": {
    "id": "e4f8d2b1-4c6e-48a3-9b2f-7a1c3d5e9f01",
    "title": "Quarterly Architecture Plan (Verified)",
    "description": "Updated specifications with completed Neon benchmarks",
    "metadata": { "priority": "critical", "signedOff": true },
    "createdAt": "2026-11-06T18:30:00.000Z",
    "updatedAt": "2026-11-06T18:45:00.000Z"
  }
}
```

### Errors & Failure Modes
- **`Record not found` (404)**: Record does not exist.
- **`Forbidden` (403)**: Caller does not own the record.
- **`-32602`**: Empty `title` or malformed UUID.

---

## Tool 5: `delete_record`

- **Purpose**: Permanently removes a record from the database.
- **When to Use**: Call this tool when the user explicitly requests to delete, erase, or purge a specific record.
- **Authorization**: Owner only.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "recordId": {
      "type": "string",
      "format": "uuid",
      "description": "The UUID of the record to permanently delete."
    },
    "authToken": {
      "type": "string",
      "description": "Optional JWT token."
    }
  },
  "required": ["recordId"]
}
```

### Example Tool Output
```json
{
  "success": true,
  "message": "Record deleted successfully.",
  "deletedRecordId": "e4f8d2b1-4c6e-48a3-9b2f-7a1c3d5e9f01",
  "deletedAt": "2026-11-06T18:50:00.000Z"
}
```

### Errors & Failure Modes
- **`Record not found` (404)**: Record does not exist.
- **`Forbidden` (403)**: Caller does not own the record.

---

## Tool 6: `search_records`

- **Purpose**: Performs a case-insensitive keyword search across record titles and descriptions.
- **When to Use**: Call this tool when the user asks to find records matching a topic, query, or keyword without knowing the record ID.
- **Authorization**: Authenticated user (scoped strictly to caller's records).

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "minLength": 1,
      "description": "Search keyword or phrase to match against titles and descriptions."
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20,
      "description": "Maximum number of search results to return."
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "default": 0,
      "description": "Offset for search results pagination."
    },
    "authToken": {
      "type": "string",
      "description": "Optional JWT token."
    }
  },
  "required": ["query"]
}
```

### Example Tool Output
```json
{
  "success": true,
  "query": "benchmarks",
  "records": [
    {
      "id": "e4f8d2b1-4c6e-48a3-9b2f-7a1c3d5e9f01",
      "title": "Quarterly Architecture Plan (Verified)",
      "description": "Updated specifications with completed Neon benchmarks",
      "metadata": { "priority": "critical" },
      "createdAt": "2026-11-06T18:30:00.000Z",
      "updatedAt": "2026-11-06T18:45:00.000Z"
    }
  ],
  "totalMatches": 1
}
```

### Errors & Failure Modes
- **`-32602`**: Empty `query` string.
- **`-32000`**: Unauthenticated request.

---

## Tool 7: `get_database_stats`

- **Purpose**: Provides aggregate statistics about user records, system-wide counts, and live Neon connection health.
- **When to Use**: Call this tool when the user inquires about database size, storage usage, activity over the last 24 hours, or database health.
- **Authorization**: Authenticated user.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "authToken": {
      "type": "string",
      "description": "Optional JWT token."
    }
  }
}
```

### Example Tool Output
```json
{
  "success": true,
  "userStats": {
    "userId": "00000000-0000-4000-a000-000000000001",
    "totalUserRecords": 5,
    "userRecordsCreatedLast24Hours": 3
  },
  "systemStats": {
    "totalRecords": 18,
    "totalUsers": 4,
    "totalAuditLogs": 42
  },
  "databaseHealth": {
    "status": "CONNECTED",
    "healthy": true,
    "latencyMs": 48
  },
  "timestamp": "2026-11-06T19:00:00.000Z"
}
```

### Errors & Failure Modes
- **`-32000`**: Unauthenticated request.
- **`503 Service Unavailable`**: Neon database unreachable.

---

## Tool 8: `get_system_status`

- **Purpose**: Reports the MCP server runtime health, platform metrics, memory usage, uptime, transport configuration, and live DB status.
- **When to Use**: Call this tool when the user asks about the server status, server uptime, environment info, or wants to diagnose service connectivity.
- **Authorization**: Authenticated user.

### Input Schema (Zod)
```json
{
  "type": "object",
  "properties": {
    "authToken": {
      "type": "string",
      "description": "Optional JWT token."
    }
  }
}
```

### Example Tool Output
```json
{
  "success": true,
  "system": {
    "status": "OK",
    "version": "1.0.0",
    "environment": "production",
    "uptimeSeconds": 1845,
    "uptimeFormatted": "0d 0h 30m 45s",
    "transport": "streamable-http",
    "database": {
      "status": "CONNECTED",
      "latencyMs": 45
    },
    "resources": {
      "nodeVersion": "v22.12.0",
      "platform": "linux",
      "arch": "x64",
      "memoryUsageMb": {
        "rss": 78.4,
        "heapTotal": 28.5,
        "heapUsed": 24.1,
        "external": 3.2
      },
      "systemLoadAverage": [0.15, 0.22, 0.18]
    },
    "timestamp": "2026-11-06T19:00:00.000Z"
  }
}
```

### Errors & Failure Modes
- **`-32000`**: Unauthenticated request.
- **`status: "DEGRADED"`**: Database health check timed out or failed, but the Node.js server remains responsive.
