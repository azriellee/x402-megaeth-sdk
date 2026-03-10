import type { PaymentRequired, PaymentPayload, SettleResponse } from "./types.js";

function toBase64(obj: unknown): string {
  const str = JSON.stringify(obj);
  if (typeof btoa !== "undefined") {
    // Browser environment
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
      })
    );
  }
  // Node environment
  return Buffer.from(str).toString("base64");
}

function fromBase64<T>(str: string): T {
  if (typeof atob !== "undefined") {
    // Browser environment
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded) as T;
  }
  // Node environment
  return JSON.parse(Buffer.from(str, "base64").toString("utf-8")) as T;
}

export function encodePaymentRequired(pr: PaymentRequired): string {
  return toBase64(pr);
}

export function decodePaymentRequired(header: string): PaymentRequired {
  return fromBase64<PaymentRequired>(header);
}

export function encodePaymentPayload(pp: PaymentPayload): string {
  return toBase64(pp);
}

export function decodePaymentPayload(header: string): PaymentPayload {
  return fromBase64<PaymentPayload>(header);
}

export function encodeSettleResponse(sr: SettleResponse): string {
  return toBase64(sr);
}

export function decodeSettleResponse(header: string): SettleResponse {
  return fromBase64<SettleResponse>(header);
}
