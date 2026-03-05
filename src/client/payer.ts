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
import { megaeth, MEGAETH_RPC, MEGAETH_CHAIN_ID, X402_VERSION } from "../shared/constants.js";
import type {
  PaymentRequired,
  PaymentPayload,
  PaymentRequirements,
} from "../shared/types.js";

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
    // Pick the first accepted payment method
    const accepted = paymentRequired.accepts[0];
    if (!accepted) {
      throw new Error("No accepted payment methods in 402 response");
    }

    if (accepted.scheme !== "exact-native") {
      throw new Error(`Unsupported payment scheme: ${accepted.scheme}`);
    }

    const amount = BigInt(accepted.amount);

    // Send native ETH transaction
    const txHash = await this.walletClient.sendTransaction({
      to: accepted.payTo as `0x${string}`,
      value: amount,
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
  }
}
