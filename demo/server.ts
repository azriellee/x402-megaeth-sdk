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

const account = privateKeyToAccount(PRIVATE_KEY);
const SERVER_WALLET = account.address;
const FACILITATOR_WALLET = SERVER_WALLET;

console.log(`Server wallet (payTo): ${SERVER_WALLET}`);
console.log(`Facilitator URL: ${process.env.FACILITATOR_URL}`);

// ── Article data (in-memory for demo) ──────────────────────────────

interface Article {
  id: string;
  title: string;
  preview: string;
  content: string;
  author: string;
  tags: string[];
  createdAt: string;
  priceUsd: number;
}

function formatPriceLabel(priceUsd: number): string {
  const cents = Math.round(priceUsd * 100);
  return cents < 100 ? `${cents}¢` : `$${priceUsd.toFixed(2)}`;
}

const ARTICLES: Article[] = [
  {
    id: "1",
    title: "The Future of Hyper-Efficient Layer 2s",
    preview: "MegaETH is revolutionizing the L2 landscape with sub-millisecond block times and massive throughput.",
    content: "MegaETH's architecture leverages specialized nodes and a highly optimized execution engine to achieve performance that rivals centralized systems while maintaining Ethereum's security. This is achieved through a combination of parallel execution, state trie optimizations, and a custom networking stack built for speed.\n\nThe implications are profound. For the first time, on-chain applications can respond at the speed users expect from web2 services — sub-100ms latency with 10ms block times. This isn't just an incremental improvement; it's an architectural leap that unlocks entirely new categories of applications.\n\nReal-time gaming, high-frequency trading, live collaboration tools — all of these were previously incompatible with blockchain's inherent latency. MegaETH changes that equation entirely.",
    author: "Skate Team",
    tags: ["MegaETH", "Layer 2", "Performance"],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    priceUsd: 0.05,
  },
  {
    id: "2",
    title: "Micropayments: The Missing Link in Web3",
    preview: "For years, high gas fees made sub-dollar transactions impossible on-chain. x402 and MegaETH together finally solve this.",
    content: "x402 introduces a standard for HTTP-level micropayments. By gating resources with a 402 Payment Required status, servers can request small payments in exchange for content. When combined with MegaETH's extremely low fees, this enables a whole new class of pay-as-you-go applications.\n\nPay-per-article, pay-per-API-call, pay-per-frame in video streaming — these models were previously theoretical. Gas fees on Ethereum mainnet made any transaction under $5 economically unviable. MegaETH's 60,000 minimum gas model changes this calculus entirely.\n\nSkate's cross-chain infrastructure amplifies this further. Users on any supported VM can pay for content without switching chains or managing multiple wallets. The friction of micropayments collapses to near zero.",
    author: "Skate Team",
    tags: ["x402", "Micropayments", "DeFi"],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    priceUsd: 0.03,
  },
];

// ── Express app ────────────────────────────────────────────────────

const app = express();
app.use(cors({ exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] }));
app.use(express.json());

// ── x402 payment middleware ────────────────────────────────────────
// Static routes use a fixed RouteConfig.
// Dynamic routes use a resolver function — the middleware calls it per
// request to get the config (including price) from the article data.

app.use(
  paymentMiddleware({
    routes: {
      "/health": {
        price: "$0.002",
        payTo: SERVER_WALLET,
        asset: "ETH",
        scheme: "exact-native",
        description: "Health check — 0.2¢ micropayment",
        extra: { priceLabel: "0.2¢" },
      },
      "/usdm-health": {
        price: "$0.02",
        payTo: SERVER_WALLET,
        asset: "USDM",
        scheme: "permit-erc20",
        description: "Health check — 2¢ in USDM via permit",
        extra: { spender: FACILITATOR_WALLET, priceLabel: "2¢" },
      },
      // Dynamic pricing — price is read from the article at request time
      "/articles/:id": (req) => {
        const id = req.path.split("/").pop();
        const article = ARTICLES.find((a) => a.id === id);
        if (!article) return null; // not found → skip middleware, handler returns 404
        const priceLabel = formatPriceLabel(article.priceUsd);
        return [
          {
            price: `$${article.priceUsd}`,
            payTo: SERVER_WALLET,
            asset: "ETH",
            scheme: "exact-native",
            description: `Read "${article.title}" — ${priceLabel} in ETH`,
            extra: { priceLabel },
          },
          {
            price: `$${article.priceUsd}`,
            payTo: SERVER_WALLET,
            asset: "USDM",
            scheme: "permit-erc20",
            description: `Read "${article.title}" — ${priceLabel} in USDM`,
            extra: { spender: FACILITATOR_WALLET, priceLabel },
          },
        ];
      },
    },
  })
);

// ── Route handlers ─────────────────────────────────────────────────

// Protected — only reached after payment is verified by middleware
app.get("/articles/:id", (req, res) => {
  const article = ARTICLES.find((a) => a.id === req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  res.json({
    ...article,
    message: `You paid ${formatPriceLabel(article.priceUsd)} to read this article.`,
    paidBy: res.locals.payerAddress as string,
    txHash: res.locals.paymentTxHash as string,
    network: "MegaETH (eip155:4326)",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    message: "You paid 0.2¢ in ETH for this health check on MegaETH!",
    paidBy: res.locals.payerAddress as string,
    txHash: res.locals.paymentTxHash as string,
    network: "MegaETH (eip155:4326)",
  });
});

app.get("/usdm-health", (req, res) => {
  res.json({
    status: "super-healthy",
    timestamp: new Date().toISOString(),
    message: "You paid 2¢ in USDM via permit for this health check on MegaETH!",
    paidBy: res.locals.payerAddress as string,
    txHash: res.locals.paymentTxHash as string,
    network: "MegaETH (eip155:4326)",
  });
});

// Unprotected — article previews (free)
app.get("/articles", (req, res) => {
  res.json(
    ARTICLES.map(({ id, title, preview, author, tags, createdAt, priceUsd }) => ({
      id, title, preview, author, tags, createdAt, priceUsd,
    }))
  );
});

// Unprotected — create a new article (free)
app.post("/articles", (req, res) => {
  const { title, content, author, tags, priceUsd } = req.body as {
    title?: string;
    content?: string;
    author?: string;
    tags?: string[];
    priceUsd?: number;
  };

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "title and content are required" });
  }

  const parsedPrice = Math.max(0.001, Math.min(100, Number(priceUsd) || 0.05));
  const preview = content.trim().slice(0, 160) + (content.trim().length > 160 ? "..." : "");

  const newArticle: Article = {
    id: String(ARTICLES.length + 1),
    title: title.trim(),
    content: content.trim(),
    preview,
    author: author?.trim() || "Anonymous",
    tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 5) : [],
    createdAt: new Date().toISOString(),
    priceUsd: parsedPrice,
  };

  ARTICLES.push(newArticle);
  console.log(`Article created: "${newArticle.title}" (${formatPriceLabel(newArticle.priceUsd)})`);
  return res.status(201).json({ id: newArticle.id, title: newArticle.title });
});

// Unprotected — info
app.get("/", (req, res) => {
  res.json({
    name: "x402-megaeth-sdk demo",
    version: "0.1.1",
    endpoints: {
      "/": "This info page (free)",
      "/articles": "List article previews (free)",
      "POST /articles": "Create a new article (free)",
      "/articles/:id": "Full article content (pay-per-view, price set by author)",
      "/health": "Health check (0.2¢ ETH micropayment)",
      "/usdm-health": "Health check (2¢ USDM permit)",
    },
  });
});

const PORT = process.env.PORT || 3402;
app.listen(PORT, () => {
  console.log(`x402 demo server running on http://localhost:${PORT}`);
});
