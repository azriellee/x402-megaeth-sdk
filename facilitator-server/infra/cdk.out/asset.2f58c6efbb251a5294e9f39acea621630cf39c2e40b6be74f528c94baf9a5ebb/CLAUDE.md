# x402-megaeth-sdk

## What This Is

Modular SDK for **x402 HTTP micropayments** on **MegaETH** (chainId 4326). Published as `x402-megaeth-sdk` on npm. Built by **Skate** (skatechain.org) — a cross-chain VM interoperability protocol.

The SDK's value proposition: **protect any Express endpoint with one middleware call**. No custom payment handling in route handlers.

## Architecture

**Three-entity x402 flow:** Payer → Server (middleware) → Facilitator (settlement)

- **Payer (Client):** Browser wallet or Node.js private key signs payments
- **Server:** Express middleware intercepts requests, returns 402 if unpaid, forwards payment to facilitator
- **Facilitator:** Verifies on-chain payments (ETH) or executes gasless settlement (USDM permits)

**Two payment schemes:**
- `exact-native` — Direct ETH transfer, facilitator verifies tx on-chain
- `permit-erc20` — Gasless EIP-2612 permit signature, facilitator executes transferFrom

## Project Structure (npm workspaces)

```
src/                    # Core SDK (published to npm)
  shared/               # Types, constants, price utils, header encoding
  server/               # Express paymentMiddleware
  client/               # BrowserProviderPayer, createX402Fetch
  facilitator/          # Verification + settlement logic
demo/                   # Demo server (Express app using the SDK)
frontend-demo/          # React 19 + Vite frontend (Skate Publications UI)
facilitator-server/     # Deployable facilitator service
```

## Key Design Principles

1. **Middleware is the single integration point.** Server devs wrap routes in `paymentMiddleware()` — that's it. Route handlers only run after payment is verified.

2. **Dynamic pricing via RouteConfigResolver.** Routes can use a function `(req) => RouteConfig | RouteConfig[] | null` to resolve pricing at request time (e.g., per-article prices from a database). Return `null` to skip payment (resource not found).

3. **Multi-asset acceptance.** Each route can accept multiple payment methods (ETH and USDM). The `accepts` array in the 402 response lets clients choose.

4. **Client simplicity.** `createX402Fetch(payer)` wraps `fetch` — handles 402 responses, signs payments, retries automatically.

## Development

```bash
npm install                    # Install all workspace deps
npm run build                  # Build SDK + all workspaces
npm run demo:server            # Run demo server (port 3402)
npm run demo:frontend          # Run frontend dev server (Vite)
```

Requires `FACILITATOR_PRIVATE_KEY` in `.env` for the demo server.

## Deployed Services (Railway)

- Frontend: https://skate-x402-frontend.up.railway.app
- Server: https://skate-x402-server.up.railway.app
- Facilitator: https://skate-x402-facilitator.up.railway.app

## MegaETH Chain Details

- Chain ID: 4326
- RPC: https://mainnet.megaeth.com/rpc
- 10ms block times, 60k minimum gas
- USDM token: 0x3154Cf16ccdb4C6d922629664174b904d80F2C35

## Code Conventions

- TypeScript throughout, ESM-first (dual CJS/ESM output via tsup)
- Viem for all blockchain interactions (no ethers.js)
- Express v5 for server
- React 19 + Vite for frontend, pure CSS (no UI libraries)
- Prices stored as USD strings (`"$0.05"`) in route configs, converted to wei/token units by `parsePrice()`
