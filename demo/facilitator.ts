import "dotenv/config";
import express from "express";
import { FacilitatorVerifier } from "../src/facilitator/verifier.js";
import type { PaymentPayload, PaymentRequirements } from "../src/shared/types.js";

const PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("FACILITATOR_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const verifier = new FacilitatorVerifier(undefined, PRIVATE_KEY);

const app = express();
app.use(express.json());

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

const PORT = 3403;
app.listen(PORT, () => {
  console.log(`Facilitator running on http://localhost:${PORT}`);
  console.log(`Facilitator wallet: ${verifier.address}`);
});
