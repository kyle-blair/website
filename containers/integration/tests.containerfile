FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY test/integration ./test/integration
USER node
