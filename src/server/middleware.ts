import type { Request, Response, NextFunction } from "express";
import type {
  MiddlewareConfig,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
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

export function paymentMiddleware(config: MiddlewareConfig) {
  const ethUsdRate = config.ethUsdRate;

  return async (req: Request, res: Response, next: NextFunction) => {
    const routeConfig = config.routes[req.path];
    if (!routeConfig) {
      return next();
    }

    const network = routeConfig.network ?? MEGAETH_NETWORK;
    const maxTimeoutSeconds =
      routeConfig.maxTimeoutSeconds ?? DEFAULT_MAX_TIMEOUT_SECONDS;
    const asset = routeConfig.asset ?? "ETH";
    const scheme = routeConfig.scheme ?? "exact-native";
    // asset must be resolved first so parsePrice knows which decimal system to use
    const amount = parsePrice(routeConfig.price, ethUsdRate, asset).toString();

    const requirements: PaymentRequirements = {
      scheme,
      network,
      asset,
      amount,
      payTo: routeConfig.payTo,
      maxTimeoutSeconds,
      ...(routeConfig.extra ? { extra: routeConfig.extra } : {}),
    };

    // Output all possible accepts, currently server handles one configured standard but could handle an array.
    const accepts = [requirements];

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
        accepts,
      };

      const encoded = encodePaymentRequired(paymentRequired);
      res.status(402);
      res.setHeader("PAYMENT-REQUIRED", encoded);
      res.json(paymentRequired);
      return;
    }

    // Verify payment by calling the facilitator
    try {
      const payload = decodePaymentPayload(paymentHeader);

      if (!config.facilitatorUrl) {
        throw new Error("facilitatorUrl is not configured");
      }

      const response = await fetch(`${config.facilitatorUrl}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ payload, requirements })
      });

      if (!response.ok) {
        throw new Error(`Facilitator error: ${response.statusText}`);
      }

      const result = await response.json() as SettleResponse;

      if (!result.success) {
        const paymentRequired: PaymentRequired = {
          x402Version: X402_VERSION,
          error: result.errorReason,
          resource: {
            url: req.originalUrl,
            description: routeConfig.description,
          },
          accepts,
        };

        res.status(402);
        res.setHeader(
          "PAYMENT-REQUIRED",
          encodePaymentRequired(paymentRequired)
        );
        res.json(paymentRequired);
        return;
      }

      // Payment verified — store settlement in res.locals so route handlers can
      // embed payer/txHash in their JSON body, then set response headers and continue.
      res.locals.payerAddress = result.payer;
      res.locals.paymentTxHash = result.txHash;
      res.setHeader("PAYMENT-RESPONSE", encodeSettleResponse(result));
      res.setHeader("x-payer-address", result.payer);
      res.setHeader("x-payment-tx", result.txHash);
      next();
    } catch (err) {
      res.status(400).json({
        error: "Invalid payment header or verification failure",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
