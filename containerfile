# TODO: provide a permanent fix for this comment
# Keep this version aligned with engines.node in package.json.
FROM node:24.22.1-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm clean-install --include=dev

COPY next.config.ts tsconfig.json ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:24.22.1-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=10000

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --chown=node:node database/schema.sql ./database/schema.sql
COPY --chown=node:node scripts/health-check.mjs ./scripts/health-check.mjs
COPY --chown=node:node scripts/migrate-database.mjs ./scripts/migrate-database.mjs

USER node
EXPOSE 10000
CMD ["node", "server.js"]
