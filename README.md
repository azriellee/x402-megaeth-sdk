# x402-megaeth-sdk

Modular SDK for **x402 HTTP micropayments** using native ETH on **MegaETH mainnet**.

Implements the [x402 protocol](https://x402.org) with a custom `exact-native` payment scheme for native ETH transfers (no ERC-20 tokens or smart contracts required).

## How It Works

```
Client                          Server
  |                                |
  |  GET /health                   |
  |------------------------------->|
  |                                |
  |  402 + PAYMENT-REQUIRED header |
  |<-------------------------------|
  |                                |
  |  Send ETH on MegaETH (on-chain)|
  |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ |
  |                                |
  |  GET /health                   |
  |  + PAYMENT-SIGNATURE header    |
  |------------------------------->|
  |                                |
  |  Verify tx on-chain            |
  |                                |
  |  200 + PAYMENT-RESPONSE header |
  |<-------------------------------|
```

Each API call triggers a micropayment of **0.01 cents** (~50 gwei / 50,000,000,000 wei at $2000/ETH) directly on MegaETH.

## Quick Start

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your private key
```

### Run Demo

Terminal 1 — start the server:
```bash
npx tsx demo/server.ts
```

Terminal 2 — run the client:
```bash
npx tsx demo/client.ts
```

## Integration Guide

### Server — Protect Any Express Endpoint

```typescript
import express from "express";
import { paymentMiddleware } from "x402-megaeth-sdk";

const app = express();

app.use(paymentMiddleware({
  routes: {
    "/api/data": {
      price: "$0.0001",        // 0.01 cents in USD
      payTo: "0xYourAddress",  // Wallet that receives payments
      description: "Data endpoint",
    },
    "/api/premium": {
      price: "$0.01",          // 1 cent
      payTo: "0xYourAddress",
    },
  },
  ethUsdRate: 2000,  // Optional: ETH/USD rate (default: 2000)
}));

app.get("/api/data", (req, res) => {
  // This only runs after payment verification
  res.json({ data: "premium content", paidBy: req.headers["x-payer-address"] });
});
```

### Client — Auto-Pay for x402 Endpoints

```typescript
import { X402Payer, createX402Fetch } from "x402-megaeth-sdk";

const payer = new X402Payer("0xYourPrivateKey");
const x402Fetch = createX402Fetch(payer);

// Just use it like regular fetch — payments happen automatically
const response = await x402Fetch("https://api.example.com/data");
const data = await response.json();
```

### Client — Manual Payment Control

```typescript
import { X402Payer } from "x402-megaeth-sdk";

const payer = new X402Payer("0xYourPrivateKey");

// Step 1: Make initial request
const res = await fetch("https://api.example.com/data");
if (res.status === 402) {
  const paymentRequired = await res.json();

  // Step 2: Send micropayment
  const payment = await payer.createPayment(paymentRequired);

  // Step 3: Retry with proof
  const finalRes = await fetch("https://api.example.com/data", {
    headers: {
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64"),
    },
  });
}
```

## API Reference

### `paymentMiddleware(config)`
Express middleware that gates routes behind x402 micropayments.

| Config Field | Type | Description |
|---|---|---|
| `routes` | `Record<string, RouteConfig>` | Map of paths to payment config |
| `rpcUrl` | `string?` | MegaETH RPC URL (default: mainnet) |
| `ethUsdRate` | `number?` | ETH/USD rate for price conversion |

**RouteConfig:**
| Field | Type | Description |
|---|---|---|
| `price` | `string \| number` | `"$0.0001"` (USD) or wei amount |
| `payTo` | `string` | Recipient wallet address |
| `description` | `string?` | Endpoint description |
| `maxTimeoutSeconds` | `number?` | Payment freshness window (default: 120) |

### `X402Payer`
Client-side wallet that handles payment creation.

```typescript
const payer = new X402Payer(privateKey: `0x${string}`, rpcUrl?: string);
payer.address           // Wallet address
payer.getBalance()      // Get ETH balance (bigint)
payer.createPayment(pr) // Send ETH and return PaymentPayload
```

### `createX402Fetch(payer)`
Returns a `fetch` wrapper that auto-handles 402 responses.

### `PaymentVerifier`
Server-side on-chain transaction verification.

```typescript
const verifier = new PaymentVerifier(rpcUrl?: string);
verifier.verify(payload, requirements) // Returns SettleResponse
```

## x402 Headers

| Header | Direction | Content |
|---|---|---|
| `PAYMENT-REQUIRED` | Server → Client | Base64 JSON with payment instructions |
| `PAYMENT-SIGNATURE` | Client → Server | Base64 JSON with payment proof (txHash) |
| `PAYMENT-RESPONSE` | Server → Client | Base64 JSON with settlement confirmation |

## Network Details

| Property | Value |
|---|---|
| Chain | MegaETH Mainnet |
| Chain ID | 4326 |
| RPC | `https://mainnet.megaeth.com/rpc` |
| Explorer | `https://megaeth.blockscout.com` |
| Native Token | ETH |
| Block Time | ~10ms |

## Demo Output — Live Micropayments on MegaETH Mainnet

```
=== x402 MegaETH Micropayment Demo ===

Payer address: 0xA18b35f2194a2E39514e6e0B15d47217D4353fb0
Wallet balance: 0.002 ETH
Server: http://localhost:3402
Requests to make: 3

--- Request 1/3 ---
[x402] Payment required: 50000000000 wei to 0xA18b35f2194a2E39514e6e0B15d47217D4353fb0
[x402] Payment sent: 0x8e2c1aa2fa1c05f699fb625835d5426fbb8694da7a71666c943378bd08f743db
Status: 200
Response: {
  "status": "healthy",
  "timestamp": "2026-03-04T08:02:57.938Z",
  "message": "You paid 0.01 cents in ETH for this health check on MegaETH!",
  "network": "MegaETH (eip155:4326)"
}

--- Request 2/3 ---
[x402] Payment required: 50000000000 wei to 0xA18b35f2194a2E39514e6e0B15d47217D4353fb0
[x402] Payment sent: 0xb2564b90be9ff8943189f84fb52e766e466b01f4e4a0d13841c5c4f853ce918d
Status: 200

--- Request 3/3 ---
[x402] Payment required: 50000000000 wei to 0xA18b35f2194a2E39514e6e0B15d47217D4353fb0
[x402] Payment sent: 0x1109f64fb5957f9473488c4dbcb6375d0e0ee40876f2eb77d6e42d2b863ea26b
Status: 200

=== Summary ===
Total micropayments: 3
Balance before: 0.002 ETH
Balance after:  0.001999819428315506 ETH
Total spent:    0.000000180571684494 ETH (includes gas)
```

### On-Chain Transaction Hashes

| # | Transaction Hash | Explorer |
|---|---|---|
| 1 | `0x8e2c1aa2fa1c05f699fb625835d5426fbb8694da7a71666c943378bd08f743db` | [View](https://megaeth.blockscout.com/tx/0x8e2c1aa2fa1c05f699fb625835d5426fbb8694da7a71666c943378bd08f743db) |
| 2 | `0xb2564b90be9ff8943189f84fb52e766e466b01f4e4a0d13841c5c4f853ce918d` | [View](https://megaeth.blockscout.com/tx/0xb2564b90be9ff8943189f84fb52e766e466b01f4e4a0d13841c5c4f853ce918d) |
| 3 | `0x1109f64fb5957f9473488c4dbcb6375d0e0ee40876f2eb77d6e42d2b863ea26b` | [View](https://megaeth.blockscout.com/tx/0x1109f64fb5957f9473488c4dbcb6375d0e0ee40876f2eb77d6e42d2b863ea26b) |

### Sample cURL — See the 402 Flow

```bash
# Step 1: Request without payment → 402
curl -i http://localhost:3402/health

# HTTP/1.1 402 Payment Required
# PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwiZXJyb3IiOiIiLCJyZXNvdXJjZSI6ey...
# {"x402Version":2,"resource":{"url":"/health"},"accepts":[{"scheme":"exact-native","network":"eip155:4326","asset":"ETH","amount":"50000000000","payTo":"0x..."}]}
```

## Architecture

```
x402-megaeth-sdk/
  src/
    shared/        # Types, constants, header encoding, price utils
    server/        # Express middleware + on-chain payment verifier
    client/        # Wallet payer + auto-paying fetch wrapper
  demo/            # Working demo server + client
```

The SDK is designed to be modular:
- **Server operators** only need `paymentMiddleware` — drop it into any Express app
- **Client developers** only need `X402Payer` + `createX402Fetch` — use like regular fetch
- **The health endpoint is a placeholder** — replace it with any valuable API endpoint

## License

MIT
