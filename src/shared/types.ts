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
  network?: Network;
  maxTimeoutSeconds?: number;
  description?: string;
  asset?: "ETH" | "USDM";
  scheme?: "exact-native" | "permit-erc20";
  extra?: Record<string, unknown>;
}

export type RoutesConfig = Record<string, RouteConfig | RouteConfig[]>;

export interface MiddlewareConfig {
  routes: RoutesConfig;
  facilitatorUrl?: string; // URL for the facilitator verification server
  ethUsdRate?: number;
}
