import { Redis } from "ioredis";
import type { NonceStore } from "x402-megaeth-sdk";

const NONCE_TTL_SECONDS = 3600; // 1 hour

export class RedisNonceStore implements NonceStore {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async getAndIncrement(
    address: string,
    onChainNonce: bigint
  ): Promise<bigint> {
    const key = `x402:nonce:${address.toLowerCase()}`;
    const stored = await this.redis.get(key);

    let effectiveNonce: bigint;
    if (stored !== null) {
      const storedNonce = BigInt(stored);
      // Use whichever is higher: on-chain or our tracked nonce
      effectiveNonce = onChainNonce > storedNonce ? onChainNonce : storedNonce;
    } else {
      effectiveNonce = onChainNonce;
    }

    // Advance the nonce for the next request
    await this.redis.set(
      key,
      (effectiveNonce + 1n).toString(),
      "EX",
      NONCE_TTL_SECONDS
    );

    return effectiveNonce;
  }
}

export function createRedisClient(url: string): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redis.on("connect", () => console.log("Connected to Redis"));
  redis.on("error", (err: Error) => console.error("Redis error:", err.message));

  return redis;
}
