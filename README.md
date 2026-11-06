# Neon PostgreSQL Model Context Protocol (MCP) Server

[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-v1.32.2-purple.svg)](https://modelcontextprotocol.io/)
[![Neon Database](https://img.shields.io/badge/Database-Neon%20Postgres-00e599.svg)](https://neon.tech/)
[![NitroStack](https://img.shields.io/badge/Framework-NitroStack-orange.svg)](https://nitrostack.ai/)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20Passed-brightgreen.svg)](https://vitest.dev/)

A production-ready Model Context Protocol (MCP) server built with **TypeScript**, **Neon Serverless PostgreSQL**, **Drizzle ORM**, **NitroStack**, and the official **MCP SDK**. Exposes 8 tools over **Streamable HTTP** with JWT authentication, multi-tenancy enforcement, rate limiting, and audit logging.

Designed end-to-end for deployment on **NitroCloud** and direct integration with **ChatGPT**.

---

## 🏗 Architecture

```
ChatGPT / MCP Client
        │  (HTTPS /mcp with Bearer JWT)
        ▼
   Express Server (/health, /mcp, /)
        │  Rate Limiting, Safe Error Formatter, CORS
        ▼
   MCP Transport (Streamable HTTP)
        │  Zod Schema Validation & Bearer Auth
        ▼
   Tool Layer (8 Dedicated Modules in src/tools/)
        │  Input validation, audit log calls, service routing
        ▼
   Service Layer (recordService, statsService, systemService, auditService)
        │  Enforces multi-tenancy & ownership strictly
        ▼
   Neon PostgreSQL (Drizzle ORM, users, records, audit_logs)
```

- **Tools only call the Service Layer**: No database access or business logic in tool handlers.
- **Zero Mock Data**: All queries execute against live Neon PostgreSQL.
- **Multi-Tenancy**: Every record is scoped to its authenticated `user_id`. Cross-user access is blocked at the service level (`403 Forbidden`).
- **Safe Logging**: Token, password, and database connection string redaction is built into the logger.

---

## 📁 Project Structure

```
├── .env.example              # Environment variable template
├── .gitignore                # Strict gitignore excluding secrets and build outputs
├── Dockerfile                # Multi-stage production container image
├── drizzle.config.ts         # Drizzle Kit configuration
├── package.json              # NPM dependencies & scripts
├── tsconfig.json             # TypeScript configuration (NodeNext)
├── vitest.config.ts          # Vitest configuration
├── docs/
│   ├── chatgpt_integration.md # ChatGPT connection and conversation test script
│   ├── deployment.md         # NitroCloud deployment guide
│   ├── schema.md             # Database schema & Mermaid ER diagram
│   └── tools.md              # Detailed documentation of all 8 MCP tools
├── drizzle/
│   └── 0000_tired_cable.sql  # Drizzle migration SQL
├── scripts/
│   └── generateToken.ts      # JWT generator for ChatGPT & testing
├── src/
│   ├── config/
│   │   └── env.ts            # Fail-fast Zod environment validation
│   ├── db/
│   │   ├── index.ts          # Neon client & timeout-guarded health check
│   │   ├── migrate.ts        # Database migration runner
│   │   └── schema.ts         # Drizzle schema (users, records, audit_logs)
│   ├── middleware/
│   │   ├── auth.ts           # JWT verification & AsyncLocalStorage context
│   │   ├── errorHandler.ts   # Safe error responses & exception handling
│   │   └── rateLimiter.ts    # Sliding window rate limiter
│   ├── server.ts             # Express app, Streamable HTTP transport, routes
│   ├── services/
│   │   ├── auditService.ts   # Audit logging to Neon DB
│   │   ├── recordService.ts  # CRUD, filtering, pagination, search, ownership
│   │   ├── statsService.ts   # Database metrics & health
│   │   └── systemService.ts  # Runtime system status
│   ├── tools/                # One file per tool
│   │   ├── createRecord.ts
│   │   ├── deleteRecord.ts
│   │   ├── getDatabaseStats.ts
│   │   ├── getRecord.ts
│   │   ├── getSystemStatus.ts
│   │   ├── index.ts
│   │   ├── listRecords.ts
│   │   ├── searchRecords.ts
│   │   └── updateRecord.ts
│   └── utils/
│       └── logger.ts         # Safe logger that redacts secrets and tokens
└── tests/
    ├── integration/
    │   ├── mcpHttpIntegration.test.ts # Full HTTP MCP protocol tests
    │   └── neonIntegration.test.ts    # Full service tests against Neon DB
    └── unit/
        ├── auth.test.ts
        ├── env.test.ts
        ├── errorHandler.test.ts
        ├── logger.test.ts
        └── rateLimiter.test.ts
```

---

## 🛠 MCP Tools Reference

| Tool Name | Purpose / When to Use | Authorization |
|---|---|---|
| `create_record` | Create a new user-owned record with title, description, and metadata | Authenticated |
| `get_record` | Retrieve a specific record by UUID; verifies user ownership | Owner Only (403 if unauthorized) |
| `list_records` | Browse or paginate through user records with title and date filters | Authenticated (scoped to user) |
| `update_record` | Update title, description, or metadata for an existing record | Owner Only (403 if unauthorized) |
| `delete_record` | Permanently remove a record from the database | Owner Only (403 if unauthorized) |
| `search_records`| Search keywords across titles and descriptions owned by user | Authenticated (scoped to user) |
| `get_database_stats` | Inspect record counts, 24h activity, and Neon connection health | Authenticated |
| `get_system_status` | Check uptime, memory usage, transport mode, and live DB status | Authenticated |

For full parameter schemas and JSON examples, see [`docs/tools.md`](docs/tools.md).

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL pooled connection URL | `postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `AUTH_SECRET` | HMAC secret key for JWT signing & verification (min 16 chars) | `your_super_secret_jwt_auth_key_min_32_chars` |
| `NODE_ENV` | Environment (`development`, `test`, `production`) | `production` |
| `PORT` | Server listening port | `3000` |
| `MCP_TRANSPORT` | MCP transport protocol | `streamable-http` |
| `LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `info` |

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migrations
Applies tables (`users`, `records`, `audit_logs`) and indexes to Neon:
```bash
npm run db:migrate
```

### 3. Generate a JWT Access Token
```bash
npm run token
```

### 4. Run the Test Suite
Executes all 35 unit and integration tests against Neon PostgreSQL:
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```

The server will be available at `http://localhost:3000`.

---

## 🌐 Endpoints

- `GET /`: Returns service metadata, status, and list of supported tools.
- `GET /health`: Verifies live Neon PostgreSQL connectivity with latency check. Returns `200 OK` or `503 Service Unavailable`.
- `POST /mcp`: Streamable HTTP endpoint for Model Context Protocol JSON-RPC requests.

---

## 📦 NitroCloud Deployment

Deploy using either method:

### Option 1: GitHub Integration (Recommended)
1. Push to your GitHub repository:
   ```bash
   git push -u origin main
   ```
2. In the [NitroCloud Dashboard](https://nitrostack.ai/studio), import `https://github.com/Kadamomkar2409/mcp-neon-server`.
3. Set environment secrets (`DATABASE_URL`, `AUTH_SECRET`, `NODE_ENV=production`, `PORT=3000`, `MCP_TRANSPORT=streamable-http`).
4. Click **Deploy**.

### Option 2: NitroStack Pack Archive
1. Generate the deployment zip:
   ```bash
   npx @nitrostack/cli pack
   ```
2. Upload `mcp-server.zip` in NitroCloud.

See [`docs/deployment.md`](docs/deployment.md) for full instructions.

---

## 🤖 ChatGPT Integration

1. Go to ChatGPT > **Connected Apps** / **Connectors** (or Custom GPT Actions).
2. Add a new server:
   - **URL**: `https://<your-nitrocloud-app>.nitrocloud.app/mcp`
   - **Authentication**: Bearer Token
   - **Token**: Output from `npm run token`
3. Refer to [`docs/chatgpt_integration.md`](docs/chatgpt_integration.md) for step-by-step connection instructions and conversational test scripts.

---

## 📄 License
ISC
