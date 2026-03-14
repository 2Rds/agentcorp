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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output and plugins registry
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/plugins/ plugins/

ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

CMD ["node", "dist/index.js"]
