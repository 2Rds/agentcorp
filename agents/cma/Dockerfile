# Build context: repo root (DO App Platform — no source_dir set)
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/cma/package.json agents/cma/

RUN npm ci

COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src/ packages/shared/src/
RUN npm run build -w packages/shared

COPY packages/runtime/tsconfig.json packages/runtime/
COPY packages/runtime/src/ packages/runtime/src/
RUN npm run build -w packages/runtime

COPY agents/cma/tsconfig.json agents/cma/
COPY agents/cma/src/ agents/cma/src/
COPY agents/cma/scripts/ agents/cma/scripts/
COPY agents/cma/plugins/ agents/cma/plugins/
RUN cd agents/cma && npx tsx scripts/build-registry.ts || true
RUN npx tsc -p agents/cma

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/cma/package.json agents/cma/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/runtime/dist/ packages/runtime/dist/
COPY --from=builder /app/agents/cma/dist/ agents/cma/dist/
COPY --from=builder /app/agents/cma/plugins/ agents/cma/plugins/

WORKDIR /app/agents/cma
ENV NODE_ENV=production
ENV PORT=3004

EXPOSE 3004

CMD ["node", "dist/index.js"]
