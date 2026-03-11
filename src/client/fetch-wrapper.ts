import type { IX402Payer } from "./interfaces.js";
import type { PaymentRequired } from "../shared/types.js";
import { encodePaymentPayload, decodePaymentRequired } from "../shared/headers.js";

/**
 * Creates a fetch wrapper that automatically handles x402 Payment Required responses.
 * When a 402 is received, it sends an ETH micropayment and retries the request.
 */
export function createX402Fetch(
  payer: IX402Payer,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    // Make the initial request
    const response = await baseFetch(input, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements from header or body
    let paymentRequired: PaymentRequired;

    const paymentHeader = response.headers.get("payment-required");
    if (paymentHeader) {
      paymentRequired = decodePaymentRequired(paymentHeader);
    } else {
      // Fallback: parse from JSON body
      paymentRequired = (await response.json()) as PaymentRequired;
    }

    console.log(
      `[x402] Payment required: ${paymentRequired.accepts[0]?.amount} wei to ${paymentRequired.accepts[0]?.payTo}`
    );

    // Create payment (sends ETH on-chain for exact-native or signs USDm permit for permit-erc20)
    const paymentPayload = await payer.createPayment(paymentRequired);
    // For exact-native: client already sent the tx, so txHash is available here.
    // For permit-erc20: client only signed a permit — the facilitator submits the
    // on-chain tx, so txHash is undefined until the server responds.
    const logDetail = paymentPayload.accepted.scheme === "exact-native"
      ? `txHash: ${paymentPayload.payload.txHash}`
      : `permit signed (facilitator will settle on-chain)`;
    console.log(`[x402] ${logDetail}`);

    // Retry request with payment proof
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set(
      "PAYMENT-SIGNATURE",
      encodePaymentPayload(paymentPayload)
    );

    const retryInit: RequestInit = {
      ...init,
      headers: retryHeaders,
    };

    return baseFetch(input, retryInit);
  };
}
