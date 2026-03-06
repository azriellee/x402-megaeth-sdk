import { defineChain } from "viem";
import type { Network } from "./types.js";

export const MEGAETH_CHAIN_ID = 4326;
export const MEGAETH_NETWORK: Network = "eip155:4326";
export const MEGAETH_RPC = "https://mainnet.megaeth.com/rpc";
export const MEGAETH_EXPLORER = "https://megaeth.blockscout.com";

export const megaeth = defineChain({
  id: MEGAETH_CHAIN_ID,
  name: "MegaETH",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [MEGAETH_RPC] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: MEGAETH_EXPLORER },
  },
});

export const X402_VERSION = 2 as const;
export const DEFAULT_MAX_TIMEOUT_SECONDS = 120;
export const DEFAULT_ETH_USD_RATE = 2000;

export const USDM_ADDRESS = "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7" as const;
