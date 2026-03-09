import { parseEther } from "viem";
import { DEFAULT_ETH_USD_RATE } from "./constants.js";

/**
 * Convert a USD amount to ETH wei.
 * @param usdAmount - USD string like "$0.0001" or a number in USD
 * @param ethUsdRate - ETH/USD exchange rate (default: 2000)
 */
export function usdToWei(
  usdAmount: string | number,
  ethUsdRate: number = DEFAULT_ETH_USD_RATE
): bigint {
  let usd: number;
  if (typeof usdAmount === "string") {
    usd = parseFloat(usdAmount.replace("$", ""));
  } else {
    usd = usdAmount;
  }
  const ethAmount = usd / ethUsdRate;
  const ethString = ethAmount.toFixed(18);
  return parseEther(ethString);
}

// USDM has 18 decimals.
export const USDM_DECIMALS = 18;

export function usdToUsdm(usdAmount: string | number): bigint {
  let usd: number;
  if (typeof usdAmount === "string") {
    usd = parseFloat(usdAmount.replace("$", ""));
  } else {
    usd = usdAmount;
  }
  return BigInt(Math.round(usd * 10 ** USDM_DECIMALS));
}

/**
 * Parse a price config value into the correct on-chain amount for the given asset.
 *
 * - asset "ETH"  (or unset): dollar strings → ETH wei; raw numbers → raw wei.
 * - asset "USDM"           : dollar strings → USDM base units (6 dp); raw numbers → raw base units.
 *
 * @param price      - "$0.02", a raw wei/base-unit number, or a numeric string of raw base units
 * @param ethUsdRate - Only used for ETH conversion
 * @param asset      - "ETH" (default) or "USDM"
 */
export function parsePrice(
  price: string | number,
  ethUsdRate: number = DEFAULT_ETH_USD_RATE,
  asset: "ETH" | "USDM" = "ETH"
): bigint {
  if (typeof price === "number") {
    return BigInt(price);
  }
  if (price.startsWith("$")) {
    return asset === "USDM" ? usdToUsdm(price) : usdToWei(price, ethUsdRate);
  }
  return BigInt(price);
}
