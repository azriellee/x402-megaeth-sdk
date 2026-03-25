import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type WalletClient,
  type PublicClient,
  type Account,
  type Chain,
  type Transport,
} from "viem";
import {
  megaeth,
  MEGAETH_RPC,
  MEGAETH_CHAIN_ID,
} from "../shared/constants.js";
import { BaseX402Payer } from "./base-payer.js";

export class BrowserProviderPayer extends BaseX402Payer {
  protected walletClient: WalletClient<Transport, Chain, Account>;
  protected publicClient: PublicClient;

  constructor(
    private provider: any,
    public readonly address: string
  ) {
    super();
    this.walletClient = createWalletClient({
      account: address as `0x${string}`,
      chain: megaeth as any,
      transport: custom(provider),
    }) as any;

    // Use a standard RPC for read calls so it works even if the user's wallet is on the wrong chain
    this.publicClient = createPublicClient({
      chain: megaeth as any,
      transport: http(MEGAETH_RPC),
    }) as any;
  }

  protected async ensureCorrectChain(): Promise<void> {
    const chainId = await this.provider.request({ method: "eth_chainId" });
    if (parseInt(chainId, 16) !== MEGAETH_CHAIN_ID) {
      try {
        await this.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${MEGAETH_CHAIN_ID.toString(16)}` }],
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          await this.provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${MEGAETH_CHAIN_ID.toString(16)}`,
                chainName: "MegaETH",
                rpcUrls: [MEGAETH_RPC],
                nativeCurrency: megaeth.nativeCurrency,
                blockExplorerUrls: [megaeth.blockExplorers?.default.url],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
  }
}
