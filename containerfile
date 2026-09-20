# Keep this version aligned with engines.node in package.json.
FROM node:24.19.0-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm clean-install --include=dev

COPY next.config.ts tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.19.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=10000

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 10000
CMD ["node", "server.js"]
