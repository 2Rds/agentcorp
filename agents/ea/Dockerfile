# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Copy source and build
COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/

# Build registry (creates plugins/registry.json if plugins exist)
RUN npx tsx scripts/build-registry.ts || true

# Compile TypeScript
RUN npx tsc

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --production && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist/ dist/

# Copy plugins if they exist
COPY --from=builder /app/plugins/ plugins/ 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["node", "dist/index.js"]
