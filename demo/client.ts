import "dotenv/config";
import { X402Payer } from "../src/client/payer.js";
import { createX402Fetch } from "../src/client/fetch-wrapper.js";
import { decodeSettleResponse } from "../src/shared/headers.js";
import { MEGAETH_EXPLORER } from "../src/shared/constants.js";
import { formatEther } from "viem";

const PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("CLIENT_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3402";

async function main() {
  const payer = new X402Payer(PRIVATE_KEY);
  const x402Fetch = createX402Fetch(payer);

  const txHashes: string[] = [];
  const endpoints = [
    // `${SERVER_URL}/health`,
    // `${SERVER_URL}/usdm-health`,
    `${SERVER_URL}/articles/1`,
    `${SERVER_URL}/articles/2`,
  ];
  const numRequests = 10;

  console.log("=== x402 MegaETH Micropayment Demo ===\n");
  console.log(`Payer address: ${payer.address}`);
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Requests to make: ${numRequests}\n`);

  for (let i = 0; i < numRequests; i++) {
    const endpoint = endpoints[i % endpoints.length];
    console.log(`--- Request ${i + 1}/${numRequests} to ${endpoint.split(SERVER_URL)[1]} ---`);

    const startTime = performance.now();
    const response = await x402Fetch(endpoint);
    const data = await response.json();
    const endPaymentTime = performance.now();
    const durationMs = (endPaymentTime - startTime).toFixed(2);

    console.log(`Status: ${response.status} (completed in ${durationMs}ms)`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    // Extract payment info
    const paymentResponseHeader = response.headers.get("payment-response");
    if (paymentResponseHeader) {
      const settlement = decodeSettleResponse(paymentResponseHeader);
      txHashes.push(settlement.txHash);
      console.log(`Tx Hash: ${settlement.txHash}`);
      console.log(`Explorer: ${MEGAETH_EXPLORER}/tx/${settlement.txHash}`);
    }

    // Pause to simulate real user behavior and let chain state propagate
    if (i < numRequests - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log();
  }

  // Summary
  console.log("=== Summary ===");
  console.log(`Total micropayments: ${txHashes.length}`);
  console.log(`Transaction hashes:`);
  txHashes.forEach((hash, i) => {
    console.log(`  ${i + 1}. ${hash}`);
    console.log(`     ${MEGAETH_EXPLORER}/tx/${hash}`);
  });
}

main().catch(console.error);
