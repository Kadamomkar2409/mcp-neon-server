# NitroCloud Deployment Guide

This guide details the end-to-end deployment workflow for the Model Context Protocol (MCP) server on **NitroCloud** (via the NitroStack SDK).

---

## Live Production Deployment

- **Public Base URL**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai`
- **MCP Endpoint**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/mcp`
- **Health Check Endpoint**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/health`
- **OAuth Protected Resource Metadata**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/.well-known/oauth-protected-resource`
- **OAuth Authorization Server Metadata**: `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai/.well-known/oauth-authorization-server`

---

## 1. Deployment Workflow Options

NitroCloud supports two deployment workflows:

### Option A: GitHub Continuous Deployment (Recommended)
1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. In your **NitroCloud Dashboard** ([nitrostack.ai/studio](https://nitrostack.ai/studio) or organization dashboard):
   - Select **New Deployment** / **New Service**.
   - Choose **GitHub Repository**: `https://github.com/Kadamomkar2409/mcp-neon-server`.
   - Branch: `main`.
   - Build Command: `npm run build` (`nitrostack-cli build`).
   - Start Command: `npm start` (`nitrostack-cli start`).
3. Set the Environment Variables listed in Section 2.
4. Click **Deploy**.

### Option B: NitroStack Pack Archive Upload
1. Generate the deployment archive locally:
   ```bash
   npx @nitrostack/cli pack
   ```
   This generates `mcp-server.zip` in your project root, automatically omitting `.env`, `.git/`, test artifacts, and dev caches.
2. In the NitroCloud dashboard, choose **Upload Pack Archive**, select `mcp-server.zip`, set your environment variables, and deploy.

---

## 2. Environment Variables & Secrets in NitroCloud

Set the following variables in the NitroCloud service configuration:

| Variable Name | Required | Description | Value / Format |
|---|:---:|---|---|
| `DATABASE_URL` | **Yes** | Pooled Neon PostgreSQL connection URL | `postgresql://<user>:<password>@ep-<branch>-pooler.<region>.aws.neon.tech/<dbname>?sslmode=require` |
| `AUTH_SECRET` | **Yes** | 32+ character HMAC secret for JWT signing | Strong random string (e.g. 64-char hex) |
| `PUBLIC_BASE_URL` | **Yes** | Public HTTPS domain for OAuth discovery & callbacks | `https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai` |
| `NODE_ENV` | **Yes** | Environment mode | `production` |
| `PORT` | **Yes** | Container listening port | `3000` |
| `MCP_TRANSPORT` | **Yes** | Transport protocol | `streamable-http` |
| `LOG_LEVEL` | No | Log verbosity | `info` |

> [!IMPORTANT]
> The `PUBLIC_BASE_URL` environment variable is critical: because NitroCloud operates behind a reverse proxy that terminates TLS, setting this variable guarantees that all OAuth metadata and redirect URLs use `https://`.

---

## 3. Post-Deployment Verification

Run the automated live verification script against the deployment:
```bash
npx tsx scripts/verifyLive.ts
```

This automated test checks:
1. `GET /.well-known/oauth-protected-resource`: Verifies RFC 8707 metadata and HTTPS scheme.
2. `GET /.well-known/oauth-authorization-server`: Verifies RFC 8414 metadata and PKCE S256 advertisement.
3. `POST /mcp` without token: Confirms `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="..."`.
4. `POST /oauth/register`: Tests dynamic client registration (RFC 7591).
5. `GET /oauth/authorize` & `POST /oauth/token`: Executes the full PKCE S256 authorization flow and retrieves a Bearer access token.
6. `POST /mcp`: Executes `initialize`, `tools/list`, `get_system_status`, `create_record`, `get_record`, `update_record`, `search_records`, and `delete_record` against Neon PostgreSQL.
7. Validation & Error Handling: Confirms Zod empty title rejection (`-32602`) and invalid token rejection (`401`).
8. Cleanup: Guarantees all created test records are deleted from Neon.

---

## 4. Troubleshooting NitroCloud Deployments

### Issue: "Build Required - Run npm run build first" on container start
- **Cause**: `nitrostack start` specifically expects `dist/index.js`.
- **Solution**: Ensure `src/index.ts` is compiled by `nitrostack-cli build` to `dist/index.js` and that `package.json` specifies `"main": "dist/index.js"`. This is already configured in the repo.

### Issue: OAuth URLs return `http://`
- **Cause**: Reverse proxy headers (`X-Forwarded-Proto`) were not detected or `PUBLIC_BASE_URL` was missing.
- **Solution**: Set `PUBLIC_BASE_URL=https://mcp-neon-server-6aede6e3-omkars-org-335cfd22.app.nitrocloud.ai` in NitroCloud.

### Issue: Database connection timeout upon cold start
- **Cause**: Neon compute auto-suspension.
- **Solution**: The health check endpoint (`/health`) includes a 5000ms timeout guard, allowing Neon compute 1–2 seconds to wake up.
