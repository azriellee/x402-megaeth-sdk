import {
  type WalletClient,
  type PublicClient,
  type Account,
  type Chain,
  type Transport,
  parseAbi,
  parseSignature,
} from "viem";
import {
  MEGAETH_CHAIN_ID,
  X402_VERSION,
  USDM_ADDRESS,
  MEGAETH_MIN_GAS,
  megaeth,
} from "../shared/constants.js";
import type { PaymentRequired, PaymentPayload, PaymentRequirements } from "../shared/types.js";
import type { IX402Payer } from "./interfaces.js";

const erc20Abi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
]);

export abstract class BaseX402Payer implements IX402Payer {
  protected abstract walletClient: WalletClient<Transport, Chain, Account>;
  protected abstract publicClient: PublicClient;
  public abstract readonly address: string;

  // Track nonces locally to handle back-to-back requests before they land on-chain
  private localNonceTracker: Map<string, bigint> = new Map();

  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.address as `0x${string}` });
  }

  /**
   * Optional hook for subclasses to ensure the correct chain is selected.
   * Useful for browser wallets.
   */
  protected async ensureCorrectChain?(): Promise<void>;

  async createPayment(paymentRequired: PaymentRequired, selectedRequirement?: PaymentRequirements): Promise<PaymentPayload> {
    // Use selection if provided, otherwise prefer permit-erc20 then exact-native
    const accepted =
      selectedRequirement ||
      paymentRequired.accepts.find((a) => a.scheme === "permit-erc20") ||
      paymentRequired.accepts.find((a) => a.scheme === "exact-native");

    if (!accepted) {
      throw new Error("No accepted payment methods in 402 response");
    }

    const amount = BigInt(accepted.amount);

    if (accepted.scheme === "exact-native") {
      if (this.ensureCorrectChain) {
        await this.ensureCorrectChain();
      }

      // MegaETH requires a minimum of 60,000 gas (21k compute + 39k storage).
      const txHash = await this.walletClient.sendTransaction({
        to: accepted.payTo as `0x${string}`,
        value: amount,
        gas: MEGAETH_MIN_GAS,
        chain: megaeth,
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        x402Version: X402_VERSION,
        resource: paymentRequired.resource,
        accepted,
        payload: {
          txHash,
          from: this.address,
          chainId: MEGAETH_CHAIN_ID,
        },
      };
    } else if (accepted.scheme === "permit-erc20" && accepted.asset === "USDM") {
      if (this.ensureCorrectChain) {
        await this.ensureCorrectChain();
      }

      // EIP-2612 Permit for USDM
      // 1. Get current nonce
      const onChainNonce = await this.publicClient.readContract({
        address: USDM_ADDRESS,
        abi: erc20Abi,
        functionName: "nonces",
        args: [this.address as `0x${string}`],
      }) as bigint;

      const trackerKey = `${accepted.asset}-${this.address.toLowerCase()}`;
      const localNonce = this.localNonceTracker.get(trackerKey) ?? 0n;
      
      // Use the higher of the two, then increment for the next request
      const nonce = onChainNonce > localNonce ? onChainNonce : localNonce;
      this.localNonceTracker.set(trackerKey, nonce + 1n);

      // 2. Set deadline (e.g., 5 min from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

      // 3. Sign typed data
      const domain = {
        name: "MegaUSD",
        version: "1",
        chainId: MEGAETH_CHAIN_ID,
        verifyingContract: USDM_ADDRESS,
      } as const;

      const spender = accepted.extra?.spender as `0x${string}`;
      if (!spender) {
        throw new Error("Missing spender address in payment requirements for permit-erc20");
      }

      const message = {
        owner: this.address as `0x${string}`,
        spender,
        value: amount,
        nonce: nonce as bigint,
        deadline,
      } as const;

      const signature = await this.walletClient.signTypedData({
        domain,
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message,
      } as any); // cast to any because of complex account/chain types in subclasses

      // Parse signature (r, s, v)
      const { v, r, s } = parseSignature(signature);

      if (v === undefined) {
        throw new Error("Invalid signature: v is undefined");
      }

      return {
        x402Version: X402_VERSION,
        resource: paymentRequired.resource,
        accepted,
        payload: {
          from: this.address,
          chainId: MEGAETH_CHAIN_ID,
          permitSignature: {
            v: Number(v),
            r,
            s,
            deadline: Number(deadline),
            spender,
            value: amount.toString(),
            nonce: Number(nonce),
          },
        },
      };
    }

    throw new Error(`Unsupported payment logic for scheme: ${accepted.scheme} and asset: ${accepted.asset}`);
  }
}
