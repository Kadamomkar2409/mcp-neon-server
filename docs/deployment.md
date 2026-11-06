# NitroCloud Deployment Guide

This guide details the end-to-end deployment workflow for the MCP Server on **NitroCloud** (via NitroStack).

---

## 1. NitroCloud Deployment Options

NitroCloud supports two primary deployment workflows:

### Option A: GitHub Continuous Deployment (Recommended)
1. In your **NitroCloud Dashboard** ([nitrostack.ai/studio](https://nitrostack.ai/studio) or your NitroCloud organization console):
2. Click **New Deployment** / **New Service**.
3. Select **GitHub** and connect your repository:
   - Repository: `https://github.com/Kadamomkar2409/mcp-neon-server`
   - Branch: `main`
   - Build Command: `npm run build`
   - Start Command: `npm start`
4. Set the **Environment Variables / Secrets** (detailed below).
5. Click **Deploy**.

### Option B: NitroStack Pack Archive Upload
1. Create the deployment package:
   ```bash
   npx @nitrostack/cli pack
   ```
2. This generates `mcp-server.zip` in your project root, strictly excluding `.env`, `.git/`, and dev caches.
3. In the NitroCloud dashboard, choose **Upload Archive / Pack**, select `mcp-server.zip`, set the environment variables, and deploy.

---

## 2. Secrets to Configure in NitroCloud

Set the following environment variables in the NitroCloud settings:

| Variable Name | Required | Description | Example / Recommended Value |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | Neon PostgreSQL pooled connection string | `postgresql://user:password@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `AUTH_SECRET` | **Yes** | Secret HMAC key used to sign and verify JWT access tokens (min 16 chars) | A strong 32+ character random secret string |
| `NODE_ENV` | **Yes** | Server environment | `production` |
| `PORT` | **Yes** | HTTP listening port (or dynamically provided by NitroCloud) | `3000` |
| `MCP_TRANSPORT` | **Yes** | Protocol transport mode | `streamable-http` |
| `LOG_LEVEL` | No | Logging verbosity | `info` |

---

## 3. Post-Deployment Verification

Once deployed to NitroCloud, your service will have a public HTTPS URL (e.g. `https://<your-app>.nitrocloud.app` or custom domain).

### 1. Verify Health Endpoint
```bash
curl -i https://<your-nitrocloud-url>/health
```
**Expected Response** (`200 OK`):
```json
{
  "status": "OK",
  "uptimeSeconds": 15,
  "database": {
    "status": "CONNECTED",
    "latencyMs": 42
  }
}
```

### 2. Verify Service Info Endpoint
```bash
curl -i https://<your-nitrocloud-url>/
```
**Expected Response** (`200 OK`):
Lists all 8 MCP tools, status `RUNNING`, transport `streamable-http`.

### 3. Verify MCP Protocol Handshake (`/mcp`)
```bash
curl -i -X POST https://<your-nitrocloud-url>/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "verification-client", "version": "1.0.0" }
    }
  }'
```
**Expected Response** (`200 OK`):
Returns `serverInfo: { "name": "neon-mcp-server", "version": "1.0.0" }` and protocol capabilities.
