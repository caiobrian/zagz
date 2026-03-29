FROM node:22-bookworm-slim

WORKDIR /app

# Build tools for native modules (better-sqlite3) + curl for healthcheck
RUN apt-get update && apt-get install -y \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Install Playwright Chromium + system deps (used by MCP playwright server)
RUN npx playwright install --with-deps chromium

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

# Persistent data directories (mounted as volumes)
RUN mkdir -p /app/data /app/auth_info_baileys

ENV DATABASE_FILE=/app/data/database.db \
    NODE_ENV=production

CMD ["node", "dist/index.js"]
