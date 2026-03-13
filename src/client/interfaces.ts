import type { PaymentRequired, PaymentPayload, PaymentRequirements } from "../shared/types.js";

export interface IX402Payer {
  readonly address: string;
  getBalance(): Promise<bigint>;
  createPayment(paymentRequired: PaymentRequired, selectedRequirement?: PaymentRequirements): Promise<PaymentPayload>;
}
