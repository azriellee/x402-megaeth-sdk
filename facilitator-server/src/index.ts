import "dotenv/config";
import express from "express";
import { Facilitator } from "x402-megaeth-sdk";
import type { PaymentPayload, PaymentRequirements } from "x402-megaeth-sdk";

const PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("FACILITATOR_PRIVATE_KEY not set in environment");
  process.exit(1);
}

const verifier = new Facilitator.FacilitatorVerifier(undefined, PRIVATE_KEY);

const app = express();
app.use(express.json());

// Health check (for Railway / load balancer)
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
