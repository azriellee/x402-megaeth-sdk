# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /sdk

# 1. Build the SDK as a standalone package (no workspaces)
COPY package.json package-lock.json tsconfig.json tsup.config.ts ./
COPY src/ src/
# Strip workspaces from package.json so npm ci doesn't look for them
RUN node -e "const p=require('./package.json'); delete p.workspaces; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2))"
RUN npm ci
RUN npx tsup

# 2. Pack the SDK into a tarball
RUN npm pack --pack-destination /tmp

# 3. Build the facilitator-server using the packed SDK
WORKDIR /facilitator
COPY facilitator-server/package.json facilitator-server/tsconfig.json ./
COPY facilitator-server/src/ src/
# Replace the file:.. dependency with the packed tarball
RUN node -e "const p=require('./package.json'); p.dependencies['x402-megaeth-sdk']='file:/tmp/x402-megaeth-sdk-0.1.0.tgz'; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2))"
RUN npm install
RUN npm run build

# ---- Runtime Stage ----
FROM node:20-slim AS runtime

WORKDIR /app

COPY --from=builder /facilitator/dist/ ./dist/
COPY --from=builder /facilitator/package.json ./
COPY --from=builder /tmp/x402-megaeth-sdk-0.1.0.tgz /tmp/

# Install production dependencies only
RUN node -e "const p=require('./package.json'); p.dependencies['x402-megaeth-sdk']='file:/tmp/x402-megaeth-sdk-0.1.0.tgz'; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2))"
RUN npm install --omit=dev

EXPOSE 3403

CMD ["node", "dist/index.js"]
