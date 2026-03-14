# Build context: repo root (DO App Platform — no source_dir set)
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/compliance/package.json agents/compliance/

RUN npm ci

COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src/ packages/shared/src/
RUN npm run build -w packages/shared

COPY packages/runtime/tsconfig.json packages/runtime/
COPY packages/runtime/src/ packages/runtime/src/
RUN npm run build -w packages/runtime

COPY agents/compliance/tsconfig.json agents/compliance/
COPY agents/compliance/src/ agents/compliance/src/
COPY agents/compliance/scripts/ agents/compliance/scripts/
COPY agents/compliance/plugins/ agents/compliance/plugins/
RUN cd agents/compliance && npx tsx scripts/build-registry.ts || true
RUN npx tsc -p agents/compliance

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
COPY agents/compliance/package.json agents/compliance/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/runtime/dist/ packages/runtime/dist/
COPY --from=builder /app/agents/compliance/dist/ agents/compliance/dist/
COPY --from=builder /app/agents/compliance/plugins/ agents/compliance/plugins/

WORKDIR /app/agents/compliance
ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

CMD ["node", "dist/index.js"]
