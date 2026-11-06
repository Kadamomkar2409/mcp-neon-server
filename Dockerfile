# Multi-stage production Dockerfile for NitroCloud MCP Server
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig*.json drizzle.config.ts ./

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy source code and database migrations
COPY src ./src
COPY drizzle ./drizzle

# Build TypeScript to dist
RUN npm run build

# Prune dev dependencies for lean production image
RUN npm prune --production

# Final lean runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV MCP_TRANSPORT=streamable-http

# Add curl for container health checks
RUN apk add --no-cache curl

# Copy runtime files and built artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Non-root security
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
