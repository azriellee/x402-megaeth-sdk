# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /workspace

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy SDK source (needed to build the local dependency)
COPY src/ src/
COPY tsconfig.json tsup.config.ts ./

# Copy facilitator-server package
COPY facilitator-server/ facilitator-server/

# Install all workspace dependencies & build SDK first, then facilitator
RUN npm ci --workspace=facilitator-server --include-workspace-root \
    && npm run build --ignore-scripts \
    && cd facilitator-server \
    && npm run build

# ---- Runtime Stage ----
FROM node:20-slim AS runtime

WORKDIR /app

# Copy built SDK (facilitator-server depends on it via file:..)
COPY --from=builder /workspace/dist/ /workspace-sdk/dist/
COPY --from=builder /workspace/package.json /workspace-sdk/package.json

# Copy built facilitator-server
COPY --from=builder /workspace/facilitator-server/dist/ ./dist/
COPY --from=builder /workspace/facilitator-server/package.json ./

# Install production-only dependencies
# Point the file:.. reference to the copied SDK
RUN sed -i 's|"file:.."|"file:///workspace-sdk"|' package.json \
    && npm install --omit=dev

EXPOSE 3403

CMD ["node", "dist/index.js"]
