import type { PaymentRequired, PaymentPayload, SettleResponse } from "./types.js";

function toBase64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function fromBase64<T>(str: string): T {
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
