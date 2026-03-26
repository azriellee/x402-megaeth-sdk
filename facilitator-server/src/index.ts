import "dotenv/config";
import express from "express";
import { Facilitator } from "x402-megaeth-sdk";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifierStores,
} from "x402-megaeth-sdk";

import {
  createDynamoClient,
  DynamoTxHashStore,
  DynamoPermitStore,
  DynamoSettlementTracker,
} from "./dynamo.js";
import { createRedisClient, RedisNonceStore } from "./redis.js";

async function getPrivateKey(): Promise<`0x${string}`> {
  // In AWS (development stage): fetch from Secrets Manager
  const secretName = process.env.SECRET_NAME;
  if (secretName) {
    const {
      SecretsManagerClient,
      GetSecretValueCommand,
    } = await import("@aws-sdk/client-secrets-manager");

    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || "ap-southeast-1",
    });

    try {
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: secretName })
      );
      const secret = JSON.parse(response.SecretString || "{}");
      const key = secret.FACILITATOR_PRIVATE_KEY;
      if (key) {
        console.log("Loaded private key from Secrets Manager");
        return key as `0x${string}`;
      }
      console.error("FACILITATOR_PRIVATE_KEY field not found in secret");
    } catch (err) {
      console.error("Failed to fetch secret from Secrets Manager:", err);
    }
  }

  // Fallback: read from environment / .env file (local development)
  const envKey = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
  if (envKey) {
    console.log("Loaded private key from environment");
    return envKey;
  }

  throw new Error(
    "No private key available. Set SECRET_NAME (AWS) or FACILITATOR_PRIVATE_KEY (.env)"
  );
}

function initStores(): {
  stores: VerifierStores;
  statsTracker?: DynamoSettlementTracker;
  redisCleanup?: () => Promise<void>;
} {
  const stores: VerifierStores = {};
  let statsTracker: DynamoSettlementTracker | undefined;
  let redisCleanup: (() => Promise<void>) | undefined;

  // DynamoDB stores — only if table env vars are set
  const txHashesTable = process.env.TX_HASHES_TABLE;
  const permitsTable = process.env.PERMITS_TABLE;
  const statsTable = process.env.STATS_TABLE;

  if (txHashesTable || permitsTable || statsTable) {
    const docClient = createDynamoClient();
    console.log("DynamoDB stores initialized");

    if (txHashesTable) {
      stores.txHashStore = new DynamoTxHashStore(docClient, txHashesTable);
      console.log(`  TxHash store: ${txHashesTable}`);
    }
    if (permitsTable) {
      stores.permitStore = new DynamoPermitStore(docClient, permitsTable);
      console.log(`  Permit store: ${permitsTable}`);
    }
    if (statsTable) {
      statsTracker = new DynamoSettlementTracker(docClient, statsTable);
      stores.settlementTracker = statsTracker;
      console.log(`  Stats tracker: ${statsTable}`);
    }
  } else {
    console.log("No DynamoDB tables configured — using in-memory stores");
  }

  // Redis nonce store — only if REDIS_URL is set
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const redis = createRedisClient(redisUrl);
    redis.connect().catch((err: Error) =>
      console.error("Redis connect failed:", err.message)
    );
    stores.nonceStore = new RedisNonceStore(redis);
    redisCleanup = async () => {
      await redis.quit();
      console.log("Redis connection closed");
    };
  } else {
    console.log("No REDIS_URL configured — using in-memory nonce tracking");
  }

  return { stores, statsTracker, redisCleanup };
}

async function main() {
  let privateKey: `0x${string}`;
  try {
    privateKey = await getPrivateKey();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  const { stores, statsTracker, redisCleanup } = initStores();

  const verifier = new Facilitator.FacilitatorVerifier(
    undefined,
    privateKey,
    stores
  );

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", facilitator: verifier.address });
  });

  app.get("/stats", async (_req, res) => {
    if (!statsTracker) {
      res.status(501).json({ error: "Stats not configured (no STATS_TABLE)" });
      return;
    }
    try {
      const stats = await statsTracker.getStats();
      res.json(stats);
    } catch (err) {
      console.error("Stats query error:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/verify", async (req, res) => {
    const { payload, requirements } = req.body as {
      payload: PaymentPayload;
      requirements: PaymentRequirements;
    };

    if (!payload || !requirements) {
      res.status(400).json({ error: "Missing payload or requirements" });
      return;
    }

    try {
      const result = await verifier.verify(payload, requirements);
      res.json(result);
    } catch (err) {
      console.error("Verification error:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    if (redisCleanup) await redisCleanup();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const PORT = parseInt(process.env.PORT || "3403", 10);
  app.listen(PORT, () => {
    console.log(`Facilitator running on http://0.0.0.0:${PORT}`);
    console.log(`Facilitator wallet: ${verifier.address}`);
  });
}

main();
