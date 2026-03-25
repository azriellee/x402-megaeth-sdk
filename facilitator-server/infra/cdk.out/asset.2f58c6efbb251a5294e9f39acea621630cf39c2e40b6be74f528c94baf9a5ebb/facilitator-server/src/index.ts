import "dotenv/config";
import express from "express";
import { Facilitator } from "x402-megaeth-sdk";
import type { PaymentPayload, PaymentRequirements } from "x402-megaeth-sdk";

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

async function main() {
  let privateKey: `0x${string}`;
  try {
    privateKey = await getPrivateKey();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  const verifier = new Facilitator.FacilitatorVerifier(undefined, privateKey);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", facilitator: verifier.address });
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

  const PORT = parseInt(process.env.PORT || "3403", 10);
  app.listen(PORT, () => {
    console.log(`Facilitator running on http://0.0.0.0:${PORT}`);
    console.log(`Facilitator wallet: ${verifier.address}`);
  });
}

main();
