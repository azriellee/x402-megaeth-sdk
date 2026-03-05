export type Network = `eip155:${number}`;

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequirements {
  scheme: "exact-native";
  network: Network;
  asset: "ETH";
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

export interface PaymentPayload {
  x402Version: 2;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: {
    txHash: string;
    from: string;
    chainId: number;
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
}

export type RoutesConfig = Record<string, RouteConfig>;

export interface MiddlewareConfig {
  routes: RoutesConfig;
  rpcUrl?: string;
  ethUsdRate?: number;
}
