FROM node:20 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY plugins ./plugins
COPY scripts ./scripts

# Build plugin registry + compile TypeScript
RUN npx tsx scripts/build-registry.ts && npx tsc

# --- Production image ---
FROM node:20

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install Playwright Chromium and its system dependencies
RUN npx playwright install chromium --with-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/plugins ./plugins

EXPOSE 3001

CMD ["node", "dist/index.js"]
