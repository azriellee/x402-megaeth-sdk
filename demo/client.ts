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
    `${SERVER_URL}/health`,
    `${SERVER_URL}/usdm-health`,
  ];

  console.log("=== x402 MegaETH Micropayment Demo ===\n");
  console.log(`Payer address: ${payer.address}`);

  const balance = await payer.getBalance();
  console.log(`Wallet balance: ${formatEther(balance)} ETH`);
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Requests to make: ${endpoints.length}\n`);

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    console.log(`--- Request ${i + 1}/${endpoints.length} to ${endpoint.split(SERVER_URL)[1]} ---`);

    const startTime = performance.now();
    const response = await x402Fetch(endpoint);
    const data = await response.json();
    const endTime = performance.now();
    const durationMs = (endTime - startTime).toFixed(2);

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

  const balanceAfter = await payer.getBalance();
  console.log(`\nBalance before: ${formatEther(balance)} ETH`);
  console.log(`Balance after:  ${formatEther(balanceAfter)} ETH`);
  console.log(
    `Total spent:    ${formatEther(balance - balanceAfter)} ETH (includes gas)`
  );
}

main().catch(console.error);
