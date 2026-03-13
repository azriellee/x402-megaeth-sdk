# x402-megaeth-sdk

Modular SDK for **x402 HTTP micropayments** on **MegaETH**. Supports both native ETH and USDM (ERC-20) with gasless permits for users.

Implements the [x402 protocol](https://x402.org) with a Three-Entity Architecture: **Payer**, **Target Server**, and **Facilitator**.

## Features

- ⚡ **MegaETH Optimized**: 10ms block times and low fees.
- 💰 **Dual Asset Support**: Pay with Native **ETH** or **USDM**.
- ⛽ **Gasless for Users (USDM)**: Uses EIP-2612 Permits so the Facilitator pays the gas for USDM payments.
- 🔌 **Plug & Play Middleware**: Protect any Express.js endpoint with one line of code.
- 🌐 **Browser & Node Friendly**: Works with any EIP-1193 wallet or private keys.

---

## How It Works (Three-Entity Architecture)

The x402 flow involves a **Facilitator** that acts as a verified settlement layer between the User and the API Server.

```
User (Payer)             API Server                Facilitator
     |                      |                           |
     |  1. GET /resource    |                           |
     | -------------------> |                           |
     |                      |                           |
     |  2. 402 Payment Req  |                           |
     | <------------------- |                           |
     |                      |                           |
     |  3. [ETH Tx] or      |                           |
     |     [Permit Sig]     |                           |
     | -------------------> |                           |
     |                      |                           |
     |                      | 4. Forward to Facilitator |
     |                      | ------------------------> |
     |                      |                           |
     |                      |    5. Verify (ETH) &      |
     |                      |       Settle (USDM)       |
     |                      | <------------------------ |
     |                      |                           |
     |  6. 200 OK + Content |                           |
     | <------------------- |                           |
```

---

## Monorepo Setup

This repository is organized as an **NPM Workspace**.

### 1. Install Dependencies
```bash
# Run from the root
npm install
```

### 2. Build the SDK
```bash
# Builds the SDK and the Frontend Demo
npm run build
```

### 3. Run the Demos
To see x402 in action, start the three core components:

```bash
# Terminal 1: Facilitator (Settlement Server)
npm run demo:facilitator

# Terminal 2: API Server (The Resource Owner)
npm run demo:server

# Terminal 3: Node.js Client (Automated payments)
npm run demo:client

# Terminal 4: Frontend Demo (Frontend UI Example)
npm run demo:frontend
```

---

## Integration Guide

### 1. Server — Protect Endpoints

Add the `paymentMiddleware` to your Express app. You can configure different prices and assets (ETH/USDM) per route.

```typescript
import express from "express";
import { paymentMiddleware } from "x402-megaeth-sdk";

const app = express();

app.use(paymentMiddleware({
  facilitatorUrl: "http://localhost:3403",
  routes: {
    "/api/standard": {
      price: "$0.001",         // 0.1 cents in ETH
      payTo: "0xProvider...",
      asset: "ETH",
      scheme: "exact-native",
    },
    "/api/premium": {
      price: "$0.05",          // 5 cents in USDM
      asset: "USDM",
      scheme: "permit-erc20",
      payTo: "0xProvider...",
      extra: { spender: "0xFacilitator..." }
    },
  },
}));

app.get("/api/premium", (req, res) => {
  res.json({ 
    data: "Premium Content", 
    paidBy: res.locals.payerAddress 
  });
});
```

### 2. Client — Browser (Frontend UI)

For frontend applications, use `BrowserProviderPayer`. You can also hook into the payment selection process if your server offers multiple payment methods (e.g., ETH and USDM).

```typescript
import { Client } from "x402-megaeth-sdk";
import type { PaymentRequired, PaymentRequirements } from "x402-megaeth-sdk";

// 1. Initialize with window.ethereum
const payer = new Client.BrowserProviderPayer(window.ethereum, userAddress);

// 2. Wrap fetch with an optional selection callback
const x402Fetch = Client.createX402Fetch(payer, {
  onPaymentRequired: (paymentRequired: PaymentRequired) => {
    return new Promise((resolve) => {
      // Show a UI modal to let the user choose which asset to pay with
      // resolve(chosenRequirement) or resolve(undefined) to cancel
      showMyCustomModal(paymentRequired.accepts, (choice) => resolve(choice));
    });
  }
});

// 3. Call your API — the wrapper handles retries and payments automatically
const res = await x402Fetch("http://localhost:3402/api/premium");
const data = await res.json();
```

### 3. Client — Node.js (Private Key)

Use `X402Payer` for automated agents or backend-to-backend micropayments.

```typescript
import { X402Payer, createX402Fetch } from "x402-megaeth-sdk";

const payer = new X402Payer("0xYourPrivateKey");
const x402Fetch = createX402Fetch(payer);

const res = await x402Fetch("http://localhost:3402/api/premium");
```

---

## API Reference

### `paymentMiddleware(config)`
Express middleware. Gated routes will return `402 Payment Required` with a `PAYMENT-REQUIRED` header if payment proof is missing.

| Config Field | Description |
|---|---|
| `facilitatorUrl` | The URL of the x402 Facilitator server. |
| `routes` | Map of paths to `RouteConfig`. |
| `ethUsdRate` | Optional fixed rate for $ to wei conversion. |

### `BaseX402Payer`
Abstract base class for all payers.
- `getBalance()`: Returns wallet balance.
- `createPayment(pr)`: Handles the logic for sending ETH or signing a USDM permit.

### `createX402Fetch(payer)`
Returns a `fetch` wrapper that:
1. Catches `402` responses.
2. Calls `payer.createPayment()`.
3. Retries the request with the `PAYMENT-SIGNATURE` header.

---

## Network Details (MegaETH Mainnet)

| Property | Value |
|---|---|
| Chain ID | 4326 |
| RPC | `https://mainnet.megaeth.com/rpc` |
| Block Time | ~10ms |
| Gas Model | 60,000 min gas per tx (intrinsic) |
| USDM Address | `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7` |

---

## The Facilitator Settlement Layer

The Facilitator acts as a trusted third party that ensures the API Server receives payment before the content is released. It handles different verification logic depending on the asset:

### **Native ETH (Direct Settlement)**
1. The **User** sends ETH directly to the **Server's** wallet.
2. The **Facilitator** verifies the transaction hash on MegaETH using an RPC provider.
3. It checks that the recipient address, amount, and sender match the signed request.
4. Once verified, it signals the **Server** to release the content.

### **USDM (Permit Settlement)**
1. The **User** signs an EIP-2612 Permit (off-chain signature), giving the **Facilitator** permission to move a specific amount of USDM.
2. The **Facilitator** receives this signature and submits it to the MegaETH network.
3. The **Facilitator** executes the `permit()` and `transferFrom()` transactions (paying the gas).
4. Since the settlement is atomic via the Facilitator, the **User** experiences a seamless, gasless checkout.

---

## License

MIT
