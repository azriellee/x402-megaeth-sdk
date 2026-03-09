import { defineChain } from "viem";
import type { Network } from "./types.js";

export const MEGAETH_CHAIN_ID = 4326;
export const MEGAETH_NETWORK: Network = "eip155:4326";
export const MEGAETH_RPC = "https://mainnet.megaeth.com/rpc";
// NOTE: Blockscout has indexing delays on MegaETH. Etherscan is more reliable.
export const MEGAETH_EXPLORER = "https://mega.etherscan.io";

/**
 * MegaETH uses a multidimensional gas model:
 *   - 21,000 compute gas  (standard EVM)
 *   - 39,000 storage gas  (MegaETH-specific)
 * = 60,000 minimum intrinsic gas per transaction.
 * The RPC rejects any tx with gasLimit < 60,000 with "intrinsic gas too low".
 * Viem's default estimation for a simple ETH transfer is 21,000 (not MegaETH-aware),
 * so we must always override gas when sending on MegaETH.
 */
export const MEGAETH_MIN_GAS = 60_000n;

export const megaeth = defineChain({
  id: MEGAETH_CHAIN_ID,
  name: "MegaETH",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [MEGAETH_RPC] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: MEGAETH_EXPLORER },
  },
});

export const X402_VERSION = 2 as const;
export const DEFAULT_MAX_TIMEOUT_SECONDS = 120;
export const DEFAULT_ETH_USD_RATE = 2000;

export const USDM_ADDRESS = "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7" as const;
