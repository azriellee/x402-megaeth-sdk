import {
  createPublicClient,
  http,
  type PublicClient,
  type Hash,
} from "viem";
import { megaeth, MEGAETH_RPC, MEGAETH_CHAIN_ID } from "../shared/constants.js";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "../shared/types.js";

export class PaymentVerifier {
  private client: PublicClient;
  private usedTxHashes: Set<string> = new Set();

  constructor(rpcUrl: string = MEGAETH_RPC) {
    this.client = createPublicClient({
      chain: megaeth,
      transport: http(rpcUrl),
    });
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { txHash, from, chainId } = payload.payload;
    const network = requirements.network;

    // Check chain ID
    if (chainId !== MEGAETH_CHAIN_ID) {
      return {
        success: false,
        txHash,
        network,
        payer: from,
        errorReason: `Wrong chain ID: expected ${MEGAETH_CHAIN_ID}, got ${chainId}`,
      };
    }

    // Check replay
    if (this.usedTxHashes.has(txHash)) {
      return {
        success: false,
        txHash,
        network,
        payer: from,
        errorReason: "Transaction already used for a previous payment",
      };
    }

    try {
      // Fetch transaction details with retries (MegaETH is fast but RPC may lag)
      let tx: Awaited<ReturnType<PublicClient["getTransaction"]>> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          tx = await this.client.getTransaction({ hash: txHash as Hash });
          break;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (!tx) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: "Transaction not found on-chain",
        };
      }

      // Verify recipient
      if (tx.to?.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: `Wrong recipient: expected ${requirements.payTo}, got ${tx.to}`,
        };
      }

      // Verify amount
      if (tx.value < BigInt(requirements.amount)) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: `Insufficient payment: expected ${requirements.amount} wei, got ${tx.value}`,
        };
      }

      // Verify sender
      if (tx.from.toLowerCase() !== from.toLowerCase()) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: `Sender mismatch: expected ${from}, got ${tx.from}`,
        };
      }

      // Check receipt for confirmation
      const receipt = await this.client.getTransactionReceipt({
        hash: txHash as Hash,
      });

      if (receipt.status !== "success") {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: "Transaction reverted on-chain",
        };
      }

      // Mark as used
      this.usedTxHashes.add(txHash);

      return {
        success: true,
        txHash,
        network,
        payer: from,
      };
    } catch (err) {
      return {
        success: false,
        txHash,
        network,
        payer: from,
        errorReason: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
