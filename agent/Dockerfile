FROM node:20 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

# --- Production image ---
FROM node:20

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install Playwright Chromium and its system dependencies
RUN npx playwright install chromium --with-deps

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
