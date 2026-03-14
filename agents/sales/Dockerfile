# Build context: repo root (DO App Platform — no source_dir set)
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/sales/package.json agents/sales/

RUN npm ci

COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src/ packages/shared/src/
RUN npm run build -w packages/shared

COPY packages/runtime/tsconfig.json packages/runtime/
COPY packages/runtime/src/ packages/runtime/src/
RUN npm run build -w packages/runtime

COPY agents/sales/tsconfig.json agents/sales/
COPY agents/sales/src/ agents/sales/src/
COPY agents/sales/scripts/ agents/sales/scripts/
COPY agents/sales/plugins/ agents/sales/plugins/
RUN cd agents/sales && npx tsx scripts/build-registry.ts || true
RUN npx tsc -p agents/sales

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/sales/package.json agents/sales/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/runtime/dist/ packages/runtime/dist/
COPY --from=builder /app/agents/sales/dist/ agents/sales/dist/
COPY --from=builder /app/agents/sales/plugins/ agents/sales/plugins/

WORKDIR /app/agents/sales
ENV NODE_ENV=production
ENV PORT=3007

EXPOSE 3007

CMD ["node", "dist/index.js"]
