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
import { recoverPermitSigner } from "./utils.js";

const erc20Abi = parseAbi([
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export class FacilitatorVerifier {
  private publicClient: PublicClient;
  private walletClient?: WalletClient<Transport, Chain, Account>;
  private account?: Account;
  private usedTxHashes: Set<string> = new Set();
  private processedPermits: Set<string> = new Set();

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
      return this.verifyAndSettlePermit(payload, requirements);
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

      const tx = await this.getTransactionFromBlockOrRPC(receipt);
      if (!tx) {
        return {
          success: false,
          txHash,
          network,
          payer: from,
          errorReason: "Transaction not found on-chain (RPC indexing lag)",
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

      return { success: true, txHash, network, payer: from };
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

  private async verifyAndSettlePermit(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { from } = payload.payload;
    const network = requirements.network;

    if (!this.walletClient || !this.account) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: "Facilitator not configured with private key",
      };
    }

    // 1. Perform Off-Chain Verification based on Scheme & Asset
    const offChainResult = await this.performOffChainChecks(payload, requirements);
    if (!offChainResult.success) {
      return offChainResult;
    }

    const { r, s } = payload.payload.permitSignature!;
    const sigKey = `${r}-${s}`;
    if (this.processedPermits.has(sigKey)) {
      return {
        success: false,
        txHash: "",
        network,
        payer: from,
        errorReason: "Payment signature already processed",
      };
    }

    // 2. SOFT-SUCCESS: Fire off the on-chain settlement and return success immediately
    this.executeSettlementAsync(payload, requirements);

    return {
      success: true,
      txHash: "pending",
      network,
      payer: from,
    };
  }

  /**
   * Master dispatcher for off-chain verification.
   * This allows easy extension for new assets (like USDC) or schemes (like EIP-3009).
   */
  private async performOffChainChecks(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { scheme, asset } = requirements;
    const { from } = payload.payload;
    const network = requirements.network;

    if (scheme === "permit-erc20") {
      if (asset === "USDM") {
        return this.verifyUSDM_Permit(payload, requirements);
      }

      /**
       * FUTURE: Support for USDC on MegaETH
       * if (asset === "USDC") {
       *   // USDC usually uses EIP-3009 (receiveWithAuthorization) instead of EIP-2612 (permit)
       *   // return this.verifyUSDC_Authorization(payload, requirements);
       * }
       */
    }

    return {
      success: false,
      txHash: "",
      network,
      payer: from,
      errorReason: `No verification logic implemented for ${scheme}:${asset}`,
    };
  }

  /**
   * Specific logic for USDM (EIP-2612 Permit)
   */
  private async verifyUSDM_Permit(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const { from, permitSignature } = payload.payload;
    const network = requirements.network;

    if (!permitSignature) {
      return { success: false, txHash: "", network, payer: from, errorReason: "Missing permitSignature" };
    }

    const { v, r, s, deadline, spender, value, nonce } = permitSignature;
    const amount = BigInt(value);

    // Cryptographic Check
    try {
      const recoveredAddress = await recoverPermitSigner({
        owner: from,
        spender: this.account!.address,
        value: amount,
        deadline: BigInt(deadline),
        nonce: BigInt(nonce),
        signature: { v, r: r as Hash, s: s as Hash },
      });
      if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
        throw new Error("Recovery mismatch");
      }
    } catch (err) {
      return { success: false, txHash: "", network, payer: from, errorReason: "Invalid signature" };
    }

    // Business Logic Checks
    if (BigInt(deadline) < BigInt(Math.floor(Date.now() / 1000))) {
      return { success: false, txHash: "", network, payer: from, errorReason: "Signature expired" };
    }
    if (spender.toLowerCase() !== this.account!.address.toLowerCase()) {
      return { success: false, txHash: "", network, payer: from, errorReason: "Spender mismatch" };
    }
    if (amount < BigInt(requirements.amount)) {
      return { success: false, txHash: "", network, payer: from, errorReason: "Insufficient amount in permit" };
    }

    // On-chain Pre-checks (Balance/Nonce)
    try {
      const [onChainNonce, balance] = await Promise.all([
        this.publicClient.readContract({
          address: USDM_ADDRESS,
          abi: erc20Abi,
          functionName: "nonces",
          args: [from as `0x${string}`],
        }),
        this.publicClient.readContract({
          address: USDM_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [from as `0x${string}`],
        }),
      ]);

      if (onChainNonce !== BigInt(nonce)) {
        return { success: false, txHash: "", network, payer: from, errorReason: "Nonce mismatch" };
      }
      if (balance < amount) {
        return { success: false, txHash: "", network, payer: from, errorReason: "Insufficient balance" };
      }
    } catch (err) {
      return { success: false, txHash: "", network, payer: from, errorReason: "Chain pre-check failed" };
    }

    return { success: true, txHash: "", network, payer: from };
  }

  private async executeSettlementAsync(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    retries = 3
  ) {
    const { from, permitSignature } = payload.payload;
    if (!permitSignature || !this.walletClient || !this.account) return;

    const { v, r, s, deadline, value } = permitSignature;
    const amount = BigInt(value);
    const sigKey = `${r}-${s}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // 1. Send Permit Transaction
        const permitTxHash = await this.walletClient.writeContract({
          address: USDM_ADDRESS,
          abi: erc20Abi,
          functionName: "permit",
          args: [
            from as `0x${string}`,
            this.account.address,
            amount,
            BigInt(deadline),
            v,
            r as Hash,
            s as Hash,
          ],
        });

        await this.publicClient.waitForTransactionReceipt({ hash: permitTxHash });

        // 2. Send TransferFrom Transaction
        const transferTxHash = await this.walletClient.writeContract({
          address: USDM_ADDRESS,
          abi: erc20Abi,
          functionName: "transferFrom",
          args: [
            from as `0x${string}`,
            requirements.payTo as `0x${string}`,
            amount,
          ],
        });

        await this.publicClient.waitForTransactionReceipt({ hash: transferTxHash });

        this.processedPermits.add(sigKey);
        console.log(`[Settlement Success] Payer: ${from}, Tx: ${transferTxHash}`);
        return; // Success
      } catch (err) {
        console.error(`[Settlement Attempt ${attempt}/${retries} Failed]`, err);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Linear backoff
        }
      }
    }
    console.error(`[Settlement Fatal] Failed to settle payment for ${from} after ${retries} attempts.`);
  }

  private async getTransactionFromBlockOrRPC(
    receipt: { blockHash: Hash, transactionHash: Hash },
    retries = 8,
    delayMs = 500
  ) {
    for (let i = 0; i < retries; i++) {
      const tx = await this.publicClient.getTransaction({ hash: receipt.transactionHash }).catch(() => null);
      if (tx) return tx;

      try {
        const block = await this.publicClient.getBlock({
          blockHash: receipt.blockHash,
          includeTransactions: true
        });
        const blockTx = block.transactions.find(
          (t) => typeof t === "object" && t.hash === receipt.transactionHash
        );
        if (blockTx) return blockTx as any;
      } catch (err) {}
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }
}
