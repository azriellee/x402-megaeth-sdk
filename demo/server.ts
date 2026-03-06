import "dotenv/config";
import express from "express";
import { privateKeyToAccount } from "viem/accounts";
import { paymentMiddleware } from "../src/server/middleware.js";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY not set in .env");
  process.exit(1);
}

// Derive server wallet address from the private key
const account = privateKeyToAccount(PRIVATE_KEY);
const SERVER_WALLET = account.address;

console.log(`Server wallet (payTo): ${SERVER_WALLET}`);

const app = express();

const FACILITATOR_WALLET = process.env.FACILITATOR_WALLET || "0x0000000000000000000000000000000000000000"; // Should be configured for real apps

// x402 payment middleware — gates specified routes
app.use(
  paymentMiddleware({
    routes: {
      "/health": {
        price: "$0.0001", // 0.01 cents
        payTo: SERVER_WALLET,
        description: "Health check endpoint — 0.01 cent micropayment",
      },
      "/usdm-health": {
        price: "$0.50",
        payTo: SERVER_WALLET,
        asset: "USDM",
        scheme: "permit-erc20",
        description: "Health check endpoint — 50 cents in USDM via permit",
        extra: { spender: FACILITATOR_WALLET }, // The facilitator pays gas and transfers funds
      },
    },
    ethUsdRate: Number(process.env.ETH_USD_RATE) || 2000,
    facilitatorUrl: process.env.FACILITATOR_URL || "http://localhost:3403",
  })
);

// The actual health endpoint (only reached after payment verification)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    message: "You paid 0.01 cents in ETH for this health check on MegaETH!",
    paidBy: req.headers["x-payer-address"] as string,
    txHash: req.headers["x-payment-tx"] as string,
    network: "MegaETH (eip155:4326)",
  });
});

app.get("/usdm-health", (req, res) => {
  res.json({
    status: "super-healthy",
    timestamp: new Date().toISOString(),
    message: "You paid 50 cents in USDM via permit for this health check on MegaETH!",
    paidBy: req.headers["x-payer-address"] as string,
    txHash: req.headers["x-payment-tx"] as string,
    network: "MegaETH (eip155:4326)",
  });
});

// Unprotected info endpoint
app.get("/", (req, res) => {
  res.json({
    name: "x402-megaeth-sdk demo",
    version: "0.1.0",
    endpoints: {
      "/": "This info page (free)",
      "/health": "Health check (0.01 cent micropayment via x402 ETH)",
      "/usdm-health": "Health check (50 cents micropayment via x402 USDM permit)",
    },
  });
});

const PORT = 3402;
app.listen(PORT, () => {
  console.log(`x402 demo server running on http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/health or /usdm-health`);
});
