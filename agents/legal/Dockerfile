# Build context: repo root (DO App Platform — no source_dir set)
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/legal/package.json agents/legal/

RUN npm ci

COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src/ packages/shared/src/
RUN npm run build -w packages/shared

COPY packages/runtime/tsconfig.json packages/runtime/
COPY packages/runtime/src/ packages/runtime/src/
RUN npm run build -w packages/runtime

COPY agents/legal/tsconfig.json agents/legal/
COPY agents/legal/src/ agents/legal/src/
COPY agents/legal/scripts/ agents/legal/scripts/
COPY agents/legal/plugins/ agents/legal/plugins/
RUN cd agents/legal && npx tsx scripts/build-registry.ts || true
RUN npx tsc -p agents/legal

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/legal/package.json agents/legal/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/runtime/dist/ packages/runtime/dist/
COPY --from=builder /app/agents/legal/dist/ agents/legal/dist/
COPY --from=builder /app/agents/legal/plugins/ agents/legal/plugins/

WORKDIR /app/agents/legal
ENV NODE_ENV=production
ENV PORT=3006

EXPOSE 3006

CMD ["node", "dist/index.js"]
