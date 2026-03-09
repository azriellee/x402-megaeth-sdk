import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Account,
  type Chain,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { megaeth, MEGAETH_RPC, MEGAETH_CHAIN_ID, X402_VERSION, MEGAETH_MIN_GAS } from "../shared/constants.js";
import type {
  PaymentRequired,
  PaymentPayload,
  PaymentRequirements,
} from "../shared/types.js";

import { parseAbi } from "viem";
import { USDM_ADDRESS } from "../shared/constants.js";

const erc20Abi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
]);

export class X402Payer {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private publicClient: PublicClient;
  private account: Account;

  constructor(privateKey: `0x${string}`, rpcUrl: string = MEGAETH_RPC) {
    this.account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: megaeth,
      transport: http(rpcUrl),
    });
    this.publicClient = createPublicClient({
      chain: megaeth,
      transport: http(rpcUrl),
    });
  }

  get address(): string {
    return this.account.address;
  }

  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.account.address });
  }

  async createPayment(
    paymentRequired: PaymentRequired
  ): Promise<PaymentPayload> {
    // Prefer permit-erc20 if available, otherwise exact-native
    const accepted =
      paymentRequired.accepts.find((a) => a.scheme === "permit-erc20") ||
      paymentRequired.accepts.find((a) => a.scheme === "exact-native");

    if (!accepted) {
      throw new Error("No accepted payment methods in 402 response");
    }

    const amount = BigInt(accepted.amount);

    if (accepted.scheme === "exact-native") {
      // MegaETH requires a minimum of 60,000 gas (21k compute + 39k storage).
      // Viem defaults to 21,000 for a simple ETH transfer (not MegaETH-aware),
      // which causes the RPC to silently drop the tx with "intrinsic gas too low".
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
          from: this.account.address,
          chainId: MEGAETH_CHAIN_ID,
        },
      };
    } else if (accepted.scheme === "permit-erc20" && accepted.asset === "USDM") {
      // EIP-2612 Permit for USDM
      // 1. Get current nonce
      const nonce = await this.publicClient.readContract({
        address: USDM_ADDRESS,
        abi: erc20Abi,
        functionName: "nonces",
        args: [this.account.address as `0x${string}`],
      });

      // 2. Set deadline (e.g., 1 min from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60);

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
        owner: this.account.address as `0x${string}`,
        spender,
        value: amount,
        nonce,
        deadline,
      } as const;

      const signature = await this.walletClient.signTypedData({
        account: this.account,
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
      });

      // Parse signature (r, s, v)
      const r = signature.slice(0, 66) as `0x${string}`;
      const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
      const v = parseInt(signature.slice(130, 132), 16);

      return {
        x402Version: X402_VERSION,
        resource: paymentRequired.resource,
        accepted,
        payload: {
          from: this.account.address,
          chainId: MEGAETH_CHAIN_ID,
          permitSignature: { v, r, s, deadline: Number(deadline) },
        },
      };
    }

    throw new Error(`Unsupported payment logic for scheme: ${accepted.scheme} and asset: ${accepted.asset}`);
  }
}
