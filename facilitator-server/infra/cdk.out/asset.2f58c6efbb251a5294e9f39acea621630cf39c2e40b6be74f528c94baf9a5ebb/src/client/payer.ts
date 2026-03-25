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
import { megaeth, MEGAETH_RPC } from "../shared/constants.js";
import { BaseX402Payer } from "./base-payer.js";

export class X402Payer extends BaseX402Payer {
  protected walletClient: WalletClient<Transport, Chain, Account>;
  protected publicClient: PublicClient;
  private account: Account;

  constructor(privateKey: `0x${string}`, rpcUrl: string = MEGAETH_RPC) {
    super();
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
}
