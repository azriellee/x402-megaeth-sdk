import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  megaeth,
  MEGAETH_RPC,
  MEGAETH_CHAIN_ID,
  USDM_ADDRESS,
} from "../shared/constants.js";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "../shared/types.js";

const erc20Abi = parseAbi([
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
]);

export class FacilitatorVerifier {
  private publicClient: PublicClient;
  private walletClient?: WalletClient<Transport, Chain, Account>;
  private account?: Account;
  private usedTxHashes: Set<string> = new Set();
  private processedPermits: Set<string> = new Set(); // To prevent replay of the same permit signature

  /**
   * MegaETH's RPC can return null for eth_getTransactionByHash.
   * However, the transaction is always present in the block itself.
   * We use the receipt's blockHash to fetch the block and extract the tx.
   */
  private async getTransactionFromBlockOrRPC(
    receipt: { blockHash: Hash, transactionHash: Hash },
    retries = 8,
    delayMs = 500
  ) {
    for (let i = 0; i < retries; i++) {
      // 1. Try standard eth_getTransactionByHash
      const tx = await this.publicClient.getTransaction({ hash: receipt.transactionHash }).catch(() => null);
      if (tx) return tx;

      // 2. Fallback: fetch block and find transaction inside it
      // MegaETH RPC reliably returns block contents even if getTransactionByHash is unindexed
      try {
        const block = await this.publicClient.getBlock({
          blockHash: receipt.blockHash,
          includeTransactions: true
        });
        const blockTx = block.transactions.find(
          (t) => typeof t === "object" && t.hash === receipt.transactionHash
        );
        if (blockTx) {
          return blockTx as any; // Type assertion since viem block tx type might differ slightly, but it has to/from/value
        }
      } catch (err) {
        // Block might not be fully available yet, continue retry loop
      }

      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  constructor(rpcUrl: string = MEGAETH_RPC, privateKey?: `0x${string}`) {
    this.publicClient = createPublicClient({
      chain: megaeth,
      transport: http(rpcUrl),
    });

    if (privateKey) {
      this.account = privateKeyToAccount(privateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: megaeth,
        transport: http(rpcUrl),
      });
    }
  }

  get address(): string | undefined {
    return this.account?.address;
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { from, chainId } = payload.payload;
    const network = requirements.network;

    if (chainId !== MEGAETH_CHAIN_ID) {
      return {
        success: false,
        txHash: payload.payload.txHash || "",
        network,
        payer: from,
        errorReason: `Wrong chain ID: expected ${MEGAETH_CHAIN_ID}, got ${chainId}`,
      };
    }

    if (requirements.scheme === "exact-native") {
      return this.verifyNative(payload, requirements);
    } else if (requirements.scheme === "permit-erc20") {
      return this.executePermitAndTransfer(payload, requirements);
    } else {
      return {
        success: false,
        txHash: payload.payload.txHash || "",
        network,
        payer: from,
        errorReason: `Unsupported scheme: ${requirements.scheme}`,
      };
    }
  }

  private async verifyNative(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { txHash, from } = payload.payload;
    const network = requirements.network;

    if (!txHash) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: "Missing txHash for exact-native scheme",
      };
    }

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
      // Robustly wait for the transaction to be indexed by the RPC node.
      // This solves issues with load-balanced RPC endpoints that haven't synced yet.
      const receipt = await this.publicClient.waitForTransactionReceipt({
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

      // MegaETH can have indexing issues where getTransaction returns null.
      // We fall back to finding the transaction within its confirmed block.
      const tx = await this.getTransactionFromBlockOrRPC(receipt);

      if (!tx) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: "Transaction not found on-chain after retries (RPC indexing lag)",
        };
      }

      if (tx.to?.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: `Wrong recipient: expected ${requirements.payTo}, got ${tx.to}`,
        };
      }

      if (tx.value < BigInt(requirements.amount)) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: `Insufficient payment: expected ${requirements.amount} wei, got ${tx.value}`,
        };
      }

      if (tx.from.toLowerCase() !== from.toLowerCase()) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: `Sender mismatch: expected ${from}, got ${tx.from}`,
        };
      }

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
        errorReason: `Verification error: ${err instanceof Error ? err.message : String(err)
          }`,
      };
    }
  }

  private async executePermitAndTransfer(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { from, permitSignature } = payload.payload;
    const network = requirements.network;

    if (!this.walletClient || !this.account) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: "Facilitator not configured with private key to execute transfers",
      };
    }

    if (requirements.asset !== "USDM") {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: `Unsupported asset for permit-erc20: ${requirements.asset}`,
      };
    }

    if (!permitSignature) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: "Missing permitSignature in payload",
      };
    }

    const sigKey = `${permitSignature.r}-${permitSignature.s}`;
    if (this.processedPermits.has(sigKey)) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: "Permit signature already processed",
      };
    }

    const amount = BigInt(requirements.amount);
    const deadline = BigInt(permitSignature.deadline);

    try {
      // 1. Send Permit Transaction
      const permitTxHash = await this.walletClient.writeContract({
        address: USDM_ADDRESS,
        abi: erc20Abi,
        functionName: "permit",
        args: [
          from as `0x${string}`, // owner
          this.account.address, // spender (Facilitator is the spender)
          amount,
          deadline,
          permitSignature.v,
          permitSignature.r,
          permitSignature.s,
        ],
      });

      // Wait for permit to be mined
      const permitReceipt = await this.publicClient.waitForTransactionReceipt({ hash: permitTxHash });
      if (permitReceipt.status !== "success") {
        return {
          success: false,
          txHash: permitTxHash,
          network,
          payer: from,
          errorReason: "Permit transaction reverted",
        };
      }

      // 2. Send TransferFrom Transaction
      const transferTxHash = await this.walletClient.writeContract({
        address: USDM_ADDRESS,
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [
          from as `0x${string}`, // from
          requirements.payTo as `0x${string}`, // to
          amount,
        ],
      });

      const transferReceipt = await this.publicClient.waitForTransactionReceipt({ hash: transferTxHash });
      if (transferReceipt.status !== "success") {
        return {
          success: false,
          txHash: transferTxHash,
          network,
          payer: from,
          errorReason: "TransferFrom transaction reverted",
        };
      }

      this.processedPermits.add(sigKey);

      return {
        success: true,
        txHash: transferTxHash, // Return the final transfer hash as the proof
        network,
        payer: from,
      };

    } catch (err) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: `Permit/Transfer Execution error: ${err instanceof Error ? err.message : String(err)
          }`,
      };
    }
  }
}
