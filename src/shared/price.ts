import { parseEther } from "viem";
import { DEFAULT_ETH_USD_RATE } from "./constants.js";

/**
 * Convert a USD amount to wei.
 * @param usdAmount - USD string like "$0.0001" or a number in USD
 * @param ethUsdRate - ETH/USD exchange rate (default: 2000)
 * @returns Amount in wei as bigint
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
  // Use parseEther with enough decimal precision
  const ethString = ethAmount.toFixed(18);
  return parseEther(ethString);
}

/**
 * Parse a price config value to wei.
 * If the value is a string starting with "$", converts from USD.
 * If it's a number, treats it as raw wei.
 */
export function parsePrice(
  price: string | number,
  ethUsdRate: number = DEFAULT_ETH_USD_RATE
): bigint {
  if (typeof price === "number") {
    return BigInt(price);
  }
  if (price.startsWith("$")) {
    return usdToWei(price, ethUsdRate);
  }
  return BigInt(price);
}
