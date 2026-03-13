import "dotenv/config";
import express from "express";
import cors from "cors";
import { privateKeyToAccount } from "viem/accounts";
import { paymentMiddleware } from "../src/server/middleware.js";

// server and facilitator same wallet for this demo
const PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("FACILITATOR_PRIVATE_KEY not set in .env");
  process.exit(1);
}

// Derive server wallet address from the private key
const account = privateKeyToAccount(PRIVATE_KEY);
const SERVER_WALLET = account.address;

console.log(`Server wallet (payTo): ${SERVER_WALLET}`);

const app = express();
app.use(cors({
  exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE']
}));

const FACILITATOR_WALLET = SERVER_WALLET;

// Demo articles data
const ARTICLES = [
  {
    id: "1",
    title: "The Future of Hyper-Efficient Layer 2s",
    preview: "MegaETH is revolutionizing the L2 landscape with sub-millisecond block times and massive throughput...",
    content: "Full Article: MegaETH's architecture leverages specialized nodes and a highly optimized execution engine to achieve performance that rival centralized systems while maintaining Ethereum's security. This is achieved through a combination of parallel execution, state trie optimizations, and a custom networking stack built for speed.",
  },
  {
    id: "2",
    title: "Micropayments: The Missing Link in Web3",
    preview: "For years, high gas fees made sub-dollar transactions impossible on-chain. But with x402 and MegaETH...",
    content: "Full Article: x402 introduces a standard for HTTP-level micropayments. By gating resources with a 402 Payment Required status, servers can request small payments in exchange for content. When combined with MegaETH's extremely low fees, this enables a whole new class of 'pay-as-you-go' applications like pay-per-article, pay-per-api-call, and even pay-per-frame in video streaming.",
  }
];

// x402 payment middleware — gates specified routes
app.use(
  paymentMiddleware({
    routes: {
      "/health": {
        price: "$0.002", // 0.2 cents
        payTo: SERVER_WALLET,
        asset: "ETH",
        scheme: "exact-native",
        description: "Health check endpoint — 0.2 cent micropayment",
        extra: { priceLabel: "0.2¢" }
      },
      "/usdm-health": {
        price: "$0.02",
        payTo: SERVER_WALLET,
        asset: "USDM",
        scheme: "permit-erc20",
        description: "Health check endpoint — 2 cent in USDM via permit",
        extra: { spender: FACILITATOR_WALLET, priceLabel: "2¢" },
      },
      // Protection for all article IDs
      "/articles/:id": [
        {
          price: "$0.05",
          payTo: SERVER_WALLET,
          asset: "ETH",
          scheme: "exact-native",
          description: "Read full article — 5 cents in native ETH",
          extra: { priceLabel: "5¢" }
        },
        {
          price: "$0.05",
          payTo: SERVER_WALLET,
          asset: "USDM",
          scheme: "permit-erc20",
          description: "Read full article — 5 cents in USDM via permit",
          extra: { spender: FACILITATOR_WALLET, priceLabel: "5¢" },
        }
      ]
    },
    facilitatorUrl: process.env.FACILITATOR_URL || "http://localhost:3403",
  })
);

// Protected article content
app.get("/articles/:id", (req, res) => {
  const article = ARTICLES.find(a => a.id === req.params.id);
  if (!article) {
    return res.status(404).json({ error: "Article not found" });
  }

  res.json({
    ...article,
    message: `You paid 5 cents to read this article: ${article.title}`,
    paidBy: res.locals.payerAddress as string,
    txHash: res.locals.paymentTxHash as string,
    network: "MegaETH (eip155:4326)",
  });
});

// Unprotected article previews
app.get("/articles", (req, res) => {
  res.json(ARTICLES.map(({ id, title, preview }) => ({ id, title, preview })));
});

// The actual health endpoint (only reached after payment verification)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    message: "You paid 0.2 cents in ETH for this health check on MegaETH!",
    paidBy: res.locals.payerAddress as string,
    txHash: res.locals.paymentTxHash as string,
    network: "MegaETH (eip155:4326)",
  });
});

app.get("/usdm-health", (req, res) => {
  res.json({
    status: "super-healthy",
    timestamp: new Date().toISOString(),
    message: "You paid 2 cents in USDM via permit for this health check on MegaETH!",
    paidBy: res.locals.payerAddress as string,
    txHash: res.locals.paymentTxHash as string,
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
      "/articles": "List article previews (free)",
      "/articles/:id": "Full article content (5 cents pay-per-view)",
      "/health": "Health check (0.2 cent micropayment via x402 ETH)",
      "/usdm-health": "Health check (2 cents micropayment via x402 USDM permit)",
    },
  });
});

const PORT = 3402;
app.listen(PORT, () => {
  console.log(`x402 demo server running on http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/health or /usdm-health`);
});
