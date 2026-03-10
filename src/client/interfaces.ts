import type { PaymentRequired, PaymentPayload } from "../shared/types.js";

export interface IX402Payer {
  readonly address: string;
  getBalance(): Promise<bigint>;
  createPayment(paymentRequired: PaymentRequired): Promise<PaymentPayload>;
}
