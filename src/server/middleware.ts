import type { Request, Response, NextFunction } from "express";
import type {
  MiddlewareConfig,
  PaymentRequired,
  PaymentRequirements,
} from "../shared/types.js";
import {
  MEGAETH_NETWORK,
  X402_VERSION,
  DEFAULT_MAX_TIMEOUT_SECONDS,
} from "../shared/constants.js";
import { parsePrice } from "../shared/price.js";
import {
  encodePaymentRequired,
  decodePaymentPayload,
  encodeSettleResponse,
} from "../shared/headers.js";
import { PaymentVerifier } from "./verifier.js";

export function paymentMiddleware(config: MiddlewareConfig) {
  const verifier = new PaymentVerifier(config.rpcUrl);
  const ethUsdRate = config.ethUsdRate;

  return async (req: Request, res: Response, next: NextFunction) => {
    const routeConfig = config.routes[req.path];
    if (!routeConfig) {
      return next();
    }

    const amount = parsePrice(routeConfig.price, ethUsdRate).toString();
    const network = routeConfig.network ?? MEGAETH_NETWORK;
    const maxTimeoutSeconds =
      routeConfig.maxTimeoutSeconds ?? DEFAULT_MAX_TIMEOUT_SECONDS;

    const requirements: PaymentRequirements = {
      scheme: "exact-native",
      network,
      asset: "ETH",
      amount,
      payTo: routeConfig.payTo,
      maxTimeoutSeconds,
    };

    // Check for payment header
    const paymentHeader =
      (req.headers["payment-signature"] as string) ??
      (req.headers["x-payment"] as string);

    if (!paymentHeader) {
      // Return 402 Payment Required
      const paymentRequired: PaymentRequired = {
        x402Version: X402_VERSION,
        resource: {
          url: req.originalUrl,
          description: routeConfig.description,
        },
        accepts: [requirements],
      };

      const encoded = encodePaymentRequired(paymentRequired);
      res.status(402);
      res.setHeader("PAYMENT-REQUIRED", encoded);
      res.json(paymentRequired);
      return;
    }

    // Verify payment
    try {
      const payload = decodePaymentPayload(paymentHeader);
      const result = await verifier.verify(payload, requirements);

      if (!result.success) {
        const paymentRequired: PaymentRequired = {
          x402Version: X402_VERSION,
          error: result.errorReason,
          resource: {
            url: req.originalUrl,
            description: routeConfig.description,
          },
          accepts: [requirements],
        };

        res.status(402);
        res.setHeader(
          "PAYMENT-REQUIRED",
          encodePaymentRequired(paymentRequired)
        );
        res.json(paymentRequired);
        return;
      }

      // Payment verified — set response headers and continue
      res.setHeader("PAYMENT-RESPONSE", encodeSettleResponse(result));
      res.setHeader("x-payer-address", result.payer);
      res.setHeader("x-payment-tx", result.txHash);
      next();
    } catch (err) {
      res.status(400).json({
        error: "Invalid payment header",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
