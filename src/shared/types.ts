export type Network = `eip155:${number}`;

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequirements {
  scheme: "exact-native" | "permit-erc20";
  network: Network;
  asset: "ETH" | "USDM";
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
}

export interface PermitSignature {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
  deadline: number;
  spender: string;
  value: string;
  nonce: number;
}

export interface PaymentPayload {
  x402Version: 2;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: {
    txHash?: string; // Optional for permit-erc20 since facilitator lands it
    from: string;
    chainId: number;
    permitSignature?: PermitSignature; // Required for permit-erc20
  };
}

export interface SettleResponse {
  success: boolean;
  txHash: string;
  network: Network;
  payer: string;
  errorReason?: string;
}

export interface RouteConfig {
  price: string | number;
  payTo: string;
  asset: "ETH" | "USDM";
  scheme: "exact-native" | "permit-erc20";
  network?: Network;
  maxTimeoutSeconds?: number;
  description?: string;
  extra?: Record<string, unknown>;
}

/**
 * A resolver function that returns route config(s) dynamically per request.
 * Return `null` to skip payment for this request (e.g. resource not found).
 */
export type RouteConfigResolver = (req: any) => RouteConfig | RouteConfig[] | null;

export type RoutesConfig = Record<string, RouteConfig | RouteConfig[] | RouteConfigResolver>;

export interface MiddlewareConfig {
  routes: RoutesConfig;
  facilitatorUrl?: string; // URL for the facilitator verification server
}

// ──────────────────────────────────────────────
// Store interfaces for state externalization
// The SDK defines these abstractions; deployments provide concrete implementations
// (e.g., DynamoDB, Redis). If not provided, the verifier falls back to in-memory.
// ──────────────────────────────────────────────

/** Replay protection for native ETH payments (txHash dedup) */
export interface TxHashStore {
  /** Returns true if txHash is new (marked), false if already seen (replay) */
  checkAndMark(txHash: string): Promise<boolean>;
}

/** Permit signature dedup and lifecycle tracking */
export interface PermitStore {
  /** Returns true if sigKey is new (marked pending), false if already seen */
  checkAndMarkPending(sigKey: string): Promise<boolean>;
  markProcessed(sigKey: string): Promise<void>;
  markFailed(sigKey: string): Promise<void>;
}

/** Per-user nonce tracking for rapid permit submissions */
export interface NonceStore {
  /** Returns the effective nonce to use, advancing the stored nonce atomically */
  getAndIncrement(address: string, onChainNonce: bigint): Promise<bigint>;
}

/** Fire-and-forget settlement analytics */
export interface SettlementTracker {
  record(params: {
    scheme: string;
    asset: string;
    amountWei: string;
    payer: string;
    success: boolean;
    durationMs?: number;
  }): void;
}

/** Aggregated store configuration passed to the verifier */
export interface VerifierStores {
  txHashStore?: TxHashStore;
  permitStore?: PermitStore;
  nonceStore?: NonceStore;
  settlementTracker?: SettlementTracker;
}
