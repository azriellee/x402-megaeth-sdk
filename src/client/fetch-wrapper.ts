import type { IX402Payer } from "./interfaces.js";
import type { PaymentRequired, PaymentRequirements } from "../shared/types.js";
import { encodePaymentPayload, decodePaymentRequired } from "../shared/headers.js";

export interface X402FetchOptions {
  baseFetch?: typeof globalThis.fetch;
  /**
   * Optional callback triggered when a 402 is received.
   * If provided, the caller can choose which requirement to use.
   * If not provided, the payer will choose automatically.
   */
  onPaymentRequired?: (paymentRequired: PaymentRequired) => Promise<PaymentRequirements | undefined>;
}

/**
 * Creates a fetch wrapper that automatically handles x402 Payment Required responses.
 * When a 402 is received, it sends an ETH micropayment and retries the request.
 */
export function createX402Fetch(
  payer: IX402Payer,
  options: X402FetchOptions = {}
): typeof globalThis.fetch {
  const { baseFetch = globalThis.fetch, onPaymentRequired } = options;

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
    const paymentResponseHeader = response.headers.get("payment-response");

    // If we have a payment response but still got 402, it means the payment failed verification
    // We should proceed to ask for payment again.
    
    if (paymentHeader) {
      paymentRequired = decodePaymentRequired(paymentHeader);
    } else {
      // Fallback: parse from JSON body
      try {
        const body = await response.json();
        paymentRequired = body as PaymentRequired;
      } catch (e) {
        // If body is not JSON, we can't do much
        return response;
      }
    }

    let selectedRequirement: PaymentRequirements | undefined;
    if (onPaymentRequired) {
      selectedRequirement = await onPaymentRequired(paymentRequired);
      if (!selectedRequirement) {
        // If user cancelled or didn't select, return the 402 response
        return response;
      }
    }

    console.log(
      `[x402] Payment required: ${selectedRequirement?.amount || paymentRequired.accepts[0]?.amount} wei to ${selectedRequirement?.payTo || paymentRequired.accepts[0]?.payTo}`
    );

    // Create payment
    const paymentPayload = await payer.createPayment(paymentRequired, selectedRequirement);
    
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
