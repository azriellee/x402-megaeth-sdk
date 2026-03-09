import "dotenv/config";
import {
    createPublicClient,
    createWalletClient,
    http,
    formatEther,
    parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { megaeth, MEGAETH_CHAIN_ID, MEGAETH_RPC, MEGAETH_EXPLORER } from "../shared/constants.js";

async function main() {
    const PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
    if (!PRIVATE_KEY) {
        console.error("❌ CLIENT_PRIVATE_KEY not set in .env");
        process.exit(1);
    }

    const account = privateKeyToAccount(PRIVATE_KEY);
    console.log("=== MegaETH Transaction Diagnostic ===\n");
    console.log(`Account:    ${account.address}`);
    console.log(`RPC URL:    ${MEGAETH_RPC}`);
    console.log(`Chain ID:   ${MEGAETH_CHAIN_ID}`);
    console.log(`Explorer:   ${MEGAETH_EXPLORER}\n`);

    const publicClient = createPublicClient({
        chain: megaeth,
        transport: http(MEGAETH_RPC),
    });

    const walletClient = createWalletClient({
        account,
        chain: megaeth,
        transport: http(MEGAETH_RPC),
    });

    // --- Step 1: Verify actual RPC chain ID ---
    console.log("[1] Checking RPC chain ID...");
    const rpcChainId = await publicClient.getChainId();
    console.log(`    Reported by RPC: ${rpcChainId}`);
    console.log(`    Expected:        ${MEGAETH_CHAIN_ID}`);
    if (rpcChainId !== MEGAETH_CHAIN_ID) {
        console.error(`    ❌ CHAIN ID MISMATCH! Transactions will be silently dropped.`);
    } else {
        console.log(`    ✅ Chain ID OK`);
    }

    // --- Step 2: Check block number (liveness) ---
    console.log("\n[2] Checking block number (RPC liveness)...");
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`    ✅ Latest block: ${blockNumber}`);

    // --- Step 3: Check balance ---
    console.log("\n[3] Checking balance...");
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`    Balance: ${formatEther(balance)} ETH`);
    if (balance === 0n) {
        console.error("    ❌ Zero balance — cannot proceed with send test");
        return;
    }
    console.log("    ✅ Has balance");

    // --- Step 4: Check nonce ---
    console.log("\n[4] Checking nonce (transaction count)...");
    const nonce = await publicClient.getTransactionCount({ address: account.address });
    console.log(`    Nonce: ${nonce}`);

    // --- Step 5: Estimate gas explicitly ---
    console.log("\n[5] Estimating gas for a self-transfer...");
    try {
        const gasEstimate = await publicClient.estimateGas({
            account: account.address,
            to: account.address,
            value: parseEther("0.000001"),
        });
        console.log(`    ✅ Gas estimate: ${gasEstimate}`);
    } catch (err) {
        console.error("    ❌ Gas estimation failed:", err);
    }

    // --- Step 6: Send transaction ---
    console.log("\n[6] Sending 0.000001 ETH to self...");
    let txHash: `0x${string}` | null = null;
    try {
        txHash = await walletClient.sendTransaction({
            to: account.address,
            value: parseEther("0.000001"),
            chain: megaeth,
        });
        console.log(`    ✅ TX Hash: ${txHash}`);
        console.log(`    Explorer:  ${MEGAETH_EXPLORER}/tx/${txHash}`);
    } catch (err) {
        console.error("    ❌ sendTransaction failed:", err);
        return;
    }

    // --- Step 7: Immediately poll for the tx (before waitForReceipt) ---
    console.log("\n[7] Polling eth_getTransactionByHash immediately after send...");
    try {
        const txImmediate = await publicClient.getTransaction({ hash: txHash });
        if (txImmediate) {
            console.log(`    ✅ Found in mempool/chain immediately`);
            console.log(`       blockNumber: ${txImmediate.blockNumber}`); // null = still pending
            console.log(`       nonce: ${txImmediate.nonce}`);
            console.log(`       chainId: ${txImmediate.chainId}`);
        } else {
            console.warn("    ⚠️  Not found immediately (may be normal for some RPCs)");
        }
    } catch (err) {
        console.error("    ❌ getTransaction failed immediately after send:", err);
    }

    // --- Step 8: Wait for receipt (up to 30s) ---
    console.log("\n[8] Waiting for receipt (timeout: 30s)...");
    try {
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 30_000,
        });
        console.log(`    ✅ Confirmed!`);
        console.log(`       status:      ${receipt.status}`);
        console.log(`       blockNumber: ${receipt.blockNumber}`);
        console.log(`       gasUsed:     ${receipt.gasUsed}`);
    } catch (err) {
        console.error("    ❌ waitForTransactionReceipt failed:", err);
        console.error("    ⚠️  This is the key symptom — hash is returned but tx never lands.");
    }

    // --- Step 9: Confirm balance change ---
    console.log("\n[9] Balance after send...");
    const balanceAfter = await publicClient.getBalance({ address: account.address });
    console.log(`    Before: ${formatEther(balance)} ETH`);
    console.log(`    After:  ${formatEther(balanceAfter)} ETH`);
    const diff = balance - balanceAfter;
    if (diff > 0n) {
        console.log(`    Spent:  ${formatEther(diff)} ETH (includes gas)`);
        console.log("    ✅ Balance decreased — transaction landed on-chain");
    } else {
        console.error("    ❌ Balance unchanged — transaction did NOT land on-chain despite hash being returned!");
    }
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
