import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseAbi,
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
  X402_VERSION,
  USDM_ADDRESS
} from "../shared/constants.js";
import type {
  PaymentRequired,
  PaymentPayload,
} from "../shared/types.js";
import type { IX402Payer } from "./interfaces.js";

const erc20Abi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
]);

export class BrowserProviderPayer implements IX402Payer {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private publicClient: PublicClient;

  constructor(
    private provider: any, // e.g., window.ethereum
    public readonly address: string
  ) {
    this.walletClient = createWalletClient({
      account: address as `0x${string}`,
      chain: megaeth as any,
      transport: custom(provider),
    }) as any;

    // Use a standard RPC for read calls so it works even if the user's wallet is on the wrong chain
    this.publicClient = createPublicClient({
      chain: megaeth as any,
      transport: http(MEGAETH_RPC),
      // transport: custom(provider),
    }) as any;
  }

  private async ensureCorrectChain() {
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

  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.address as `0x${string}` });
  }

  async createPayment(
    paymentRequired: PaymentRequired
  ): Promise<PaymentPayload> {
    const accepted =
      paymentRequired.accepts.find((a) => a.scheme === "permit-erc20") ||
      paymentRequired.accepts.find((a) => a.scheme === "exact-native");

    if (!accepted) {
      throw new Error("No accepted payment methods in 402 response");
    }

    const amount = BigInt(accepted.amount);

    if (accepted.scheme === "exact-native") {
      await this.ensureCorrectChain();
      const txHash = await this.provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: this.address,
          to: accepted.payTo,
          value: amount.toString(16),
        }]
      });

      // Provide a brief wait for the tx to propagate so server sees it.
      await new Promise(r => setTimeout(r, 2000));

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
      await this.ensureCorrectChain();
      const nonce = await this.publicClient.readContract({
        address: USDM_ADDRESS,
        abi: erc20Abi,
        functionName: "nonces",
        args: [this.address as `0x${string}`],
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60);

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
      });

      const r = signature.slice(0, 66) as `0x${string}`;
      const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
      const vHex = signature.slice(130, 132);
      let v = parseInt(vHex, 16);
      if (v < 27) v += 27;

      return {
        x402Version: X402_VERSION,
        resource: paymentRequired.resource,
        accepted,
        payload: {
          from: this.address,
          chainId: MEGAETH_CHAIN_ID,
          permitSignature: { v, r, s, deadline: Number(deadline) },
        },
      };
    }

    throw new Error(`Unsupported payment logic for scheme: ${accepted.scheme} and asset: ${accepted.asset}`);
  }
}
