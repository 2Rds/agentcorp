# Build context: repo root (DO App Platform — no source_dir set)
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root + package manifests (layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/coa/package.json agents/coa/

# Install all workspace dependencies
RUN npm ci

# Build @waas/shared
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src/ packages/shared/src/
RUN npm run build -w packages/shared

# Build @waas/runtime
COPY packages/runtime/tsconfig.json packages/runtime/
COPY packages/runtime/src/ packages/runtime/src/
RUN npm run build -w packages/runtime

# Build agent
COPY agents/coa/tsconfig.json agents/coa/
COPY agents/coa/src/ agents/coa/src/
COPY agents/coa/scripts/ agents/coa/scripts/
COPY agents/coa/plugins/ agents/coa/plugins/
RUN cd agents/coa && npx tsx scripts/build-registry.ts || true
RUN npx tsc -p agents/coa

# ─── Production ──────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/coa/package.json agents/coa/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/runtime/dist/ packages/runtime/dist/
COPY --from=builder /app/agents/coa/dist/ agents/coa/dist/
COPY --from=builder /app/agents/coa/plugins/ agents/coa/plugins/

WORKDIR /app/agents/coa
ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

CMD ["node", "dist/index.js"]
