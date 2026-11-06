# Neon PostgreSQL Model Context Protocol (MCP) Server

[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-v1.32.2-purple.svg)](https://modelcontextprotocol.io/)
[![Neon Database](https://img.shields.io/badge/Database-Neon%20Postgres-00e599.svg)](https://neon.tech/)
[![NitroStack](https://img.shields.io/badge/Framework-NitroStack-orange.svg)](https://nitrostack.ai/)
[![Tests](https://img.shields.io/badge/Tests-42%20Passed-brightgreen.svg)](https://vitest.dev/)

A production-ready Model Context Protocol (MCP) server built with **TypeScript**, **Neon Serverless PostgreSQL**, **Drizzle ORM**, **NitroStack**, and the official **MCP SDK**. Exposes 8 tools over **Streamable HTTP** with RFC 8414 / RFC 8707 **OAuth 2.0 (PKCE S256)** authentication, multi-tenancy enforcement, rate limiting, and immutable audit logging.

Designed end-to-end for deployment on **NitroCloud** and direct integration as a connector in **ChatGPT**.

---

## 🏗 Architecture

```
ChatGPT (MCP Client)
       │  (HTTPS /mcp with Bearer Token / OAuth 2.0 PKCE)
       ▼
  NitroCloud (Reverse Proxy & TLS Termination)
       │  (HTTP /mcp with X-Forwarded-Proto / X-Forwarded-Host)
       ▼
  MCP Server (Express + Streamable HTTP Transport)
       │  Rate Limiting, CORS, OAuth Metadata, Zod Schema Validation
       ▼
  Tool Layer (8 Modules in src/tools/)
       │  Input validation, audit logging, service-layer dispatch
       ▼
  Service Layer (recordService, statsService, systemService, auditService)
       │  Strict multi-tenancy: user ownership verification & business logic
       ▼
  Neon PostgreSQL (Serverless Driver, Drizzle ORM, pooled connections)
```

### Architectural Principles
- **Strict Layered Separation**: Tools only invoke the service layer. No direct database access or business logic exists in tool handlers.
- **Zero Mock Data**: All operations execute against real Neon PostgreSQL tables (`users`, `records`, `audit_logs`).
- **Multi-Tenancy & Authorization**: Every record is scoped to its authenticated `user_id`. Cross-user access is blocked at the service level (`403 Forbidden`).
- **Safe Logging & Error Sanitization**: Secrets, tokens, passwords, and database connection strings are automatically redacted from console outputs and logs.

---

## 📋 Prerequisites

Before running or deploying the server, ensure you have:
1. **Node.js**: v20.x or v22.x LTS installed.
2. **Neon PostgreSQL Database**: A free serverless database from [neon.tech](https://neon.tech).
3. **NitroCloud Account**: For containerized cloud deployment ([nitrostack.ai/studio](https://nitrostack.ai/studio)).
4. **ChatGPT Plus / Team / Enterprise**: With Connected Apps / Custom Actions / MCP Connectors enabled.

---

## ⚙️ Environment Variable Guide

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable Name | Required | Purpose | Placeholder / Format Example |
|---|:---:|---|---|
| `DATABASE_URL` | **Yes** | Pooled PostgreSQL connection string for Neon | `postgresql://<user>:<password>@ep-<branch>-pooler.<region>.aws.neon.tech/<dbname>?sslmode=require` |
| `AUTH_SECRET` | **Yes** | HMAC secret key for signing and verifying JWT tokens (min 16 chars) | `your_super_secret_jwt_auth_key_min_32_chars` |
| `PUBLIC_BASE_URL` | Cloud | Public HTTPS base URL used for OAuth discovery and callbacks | `https://<your-subdomain>.nitrocloud.ai` |
| `TEST_DATABASE_URL`| Optional | Dedicated Neon test branch URL (keeps tests isolated from production) | `postgresql://<user>:<password>@ep-<test-branch>-pooler.<region>.aws.neon.tech/<dbname>?sslmode=require` |
| `NODE_ENV` | No | Environment mode (`development`, `test`, `production`) | `production` |
| `PORT` | No | Server listening port (defaults to 3000) | `3000` |
| `MCP_TRANSPORT` | No | Transport protocol (`streamable-http`) | `streamable-http` |
| `LOG_LEVEL` | No | Log output verbosity (`debug`, `info`, `warn`, `error`) | `info` |

> [!WARNING]
> Never commit `.env` or real connection strings to version control. The repository `.gitignore` strictly excludes `.env` files.

---

## 💻 Local Setup & Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` using the template above and supply your Neon `DATABASE_URL` and `AUTH_SECRET`.

### 3. Apply Database Migrations
Generates and runs the real PostgreSQL schema migrations on Neon:
```bash
npm run db:migrate
```

### 4. Run the Test Suite
Executes all 42 unit and integration tests against Neon with automated self-cleaning teardown:
```bash
npm test
```

### 5. Build for Production
Compiles TypeScript using the NitroStack CLI into `dist/index.js`:
```bash
npm run build
```

### 6. Start Production Server
```bash
npm start
```
The server will start on `http://localhost:3000`.

---

## 🛠 MCP Tools Reference (All 8 Tools)

| Tool Name | Purpose / When to Use | Authorization |
|---|---|---|
| `create_record` | Create a new user-owned record with title, description, and metadata | Authenticated User |
| `get_record` | Retrieve a specific record by UUID; verifies user ownership | Owner Only (403 if unauthorized) |
| `list_records` | Browse or paginate through user records with title and date filters | Authenticated (scoped to user) |
| `update_record` | Update title, description, or metadata for an existing record | Owner Only (403 if unauthorized) |
| `delete_record` | Permanently remove a record from the database | Owner Only (403 if unauthorized) |
| `search_records`| Search keywords across titles and descriptions owned by user | Authenticated (scoped to user) |
| `get_database_stats` | Inspect record counts, 24h activity, and Neon connection health | Authenticated User |
| `get_system_status` | Check uptime, memory usage, transport mode, and live DB status | Authenticated User |

See [`docs/tools.md`](docs/tools.md) for full JSON input schemas, example outputs, and error handling.

---

## 🌐 Server Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service information, version, transport mode, and tool list |
| `GET` | `/health` | Live Neon DB connectivity check with latency measurement |
| `ALL` | `/mcp` | Streamable HTTP endpoint for Model Context Protocol JSON-RPC requests |
| `GET` | `/.well-known/oauth-protected-resource` | RFC 8707 metadata pointing to authorization server |
| `GET` | `/.well-known/oauth-authorization-server` | RFC 8414 metadata advertising PKCE S256 and token endpoints |
| `POST` | `/oauth/register` | RFC 7591 Dynamic Client Registration endpoint |
| `ALL` | `/oauth/authorize` | Interactive OAuth consent page & PKCE authorization code issuer |
| `POST` | `/oauth/token` | PKCE code exchange & Bearer access token generator |

---

## 📦 NitroCloud Deployment

### Continuous Deployment via GitHub (Recommended)
1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. In the [NitroCloud Console](https://nitrostack.ai/studio), import the repository `https://github.com/Kadamomkar2409/mcp-neon-server`.
3. Set the following Environment Variables in NitroCloud:
   - `DATABASE_URL`: Your pooled Neon connection string.
   - `AUTH_SECRET`: Random 32+ character secret string.
   - `PUBLIC_BASE_URL`: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai`
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - `MCP_TRANSPORT`: `streamable-http`
4. Deploy the service.
5. Verify live deployment with:
   ```bash
   npx tsx scripts/verifyLive.ts
   ```

See [`docs/deployment.md`](docs/deployment.md) for detailed deployment options and troubleshooting.

---

## 🤖 ChatGPT Connector Setup with OAuth 2.0

### Step-by-Step Setup
1. Open **ChatGPT** > **Settings** > **Connected Apps** (or **Developer Settings** > **Connectors** / **Actions**).
2. Click **Add Server** / **Create Connector**.
3. Configure the connection:
   - **MCP Server URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/mcp`
   - **Authentication**: `OAuth 2.0`
   - **Authorization URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/authorize`
   - **Token URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/oauth/token`
   - **Client ID**: `chatgpt`
   - **PKCE**: Enabled (`S256`)
   - **Scope**: `mcp`
4. Click **Connect**.
5. When the authorization window appears, review the requested permissions and click **Allow & Connect**.
6. ChatGPT will complete the PKCE token exchange, discover all 8 tools, and become ready for conversation.
7. Follow the PRD Section 9 test script in [`docs/chatgpt_integration.md`](docs/chatgpt_integration.md) and record evidence in [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

*(Alternative: You can also use Bearer Token authentication by generating a token via `npm run token` and pasting it into ChatGPT).*

---

## 🔧 Troubleshooting

### 1. 401 Unauthorized with `WWW-Authenticate`
- **Symptom**: Requests to `/mcp` return HTTP 401.
- **Cause**: The server strictly enforces authentication. Anonymous calls are rejected per PRD requirements.
- **Fix**: The response includes `WWW-Authenticate: Bearer resource_metadata="..."`. ChatGPT uses this to trigger the OAuth PKCE flow automatically. Ensure your client passes `Authorization: Bearer <token>`.

### 2. HTTP URLs in OAuth Discovery
- **Symptom**: OAuth endpoints return `http://` instead of `https://`.
- **Cause**: NitroCloud reverse proxy terminates TLS, causing Express to see HTTP.
- **Fix**: Set `PUBLIC_BASE_URL=https://<your-app>.nitrocloud.ai` in your NitroCloud environment variables. The server also trusts `x-forwarded-proto` and `x-forwarded-host`.

### 3. Database Connectivity Timeout
- **Symptom**: `/health` reports `status: DEGRADED` or latency > 1000ms.
- **Cause**: Neon serverless compute may be waking up from cold suspension.
- **Fix**: Neon free tier automatically activates compute within 1–2 seconds. Retry the health check or invoke `get_system_status`.

---

## ⚠️ Known Limitations

1. **Single Seeded User Mapping in ChatGPT**:
   - In this release, all ChatGPT conversational sessions map to the pre-seeded user identity (`chatgpt-user@nitrocloud.mcp`, UUID: `00000000-0000-4000-a000-000000000001`). Individual OpenAI per-user identity linking is out of scope for intern v1.0.
2. **Neon Free Tier Cold-Start Latency**:
   - Neon serverless instances auto-suspend after 5 minutes of inactivity. The initial wake-up query may exhibit 500–1500ms latency. Subsequent queries execute with sub-50ms latency. The health check incorporates a 5000ms timeout guard to prevent premature failures.

---

## 📚 Documentation Index

- [Database Schema & ER Diagram](docs/schema.md)
- [MCP Tools Specification](docs/tools.md)
- [NitroCloud Deployment Guide](docs/deployment.md)
- [ChatGPT Integration Guide](docs/chatgpt_integration.md)
- [PRD Acceptance Criteria Checklist](docs/PRD_CHECKLIST.md)
- [ChatGPT Evidence Checklist](docs/EVIDENCE.md)
- [End-to-End Live Demo Script](docs/demo_script.md)
- [Database Safe Cleanup Script](docs/cleanup_test_data.sql)

---

## 📄 License
ISC
