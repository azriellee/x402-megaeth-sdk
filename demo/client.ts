import "dotenv/config";
import { X402Payer } from "../src/client/payer.js";
import { createX402Fetch } from "../src/client/fetch-wrapper.js";
import { decodeSettleResponse } from "../src/shared/headers.js";
import { MEGAETH_EXPLORER } from "../src/shared/constants.js";
import { formatEther } from "viem";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY not set in .env");
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3402";
const NUM_REQUESTS = 3;

async function main() {
  const payer = new X402Payer(PRIVATE_KEY);
  const x402Fetch = createX402Fetch(payer);

  console.log("=== x402 MegaETH Micropayment Demo ===\n");
  console.log(`Payer address: ${payer.address}`);

  const balance = await payer.getBalance();
  console.log(`Wallet balance: ${formatEther(balance)} ETH`);
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Requests to make: ${NUM_REQUESTS}\n`);

  const txHashes: string[] = [];

  for (let i = 1; i <= NUM_REQUESTS; i++) {
    console.log(`--- Request ${i}/${NUM_REQUESTS} ---`);

    const response = await x402Fetch(`${SERVER_URL}/health`);
    const data = await response.json();

    console.log(`Status: ${response.status}`);
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
