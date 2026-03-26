import {
  DynamoDBClient,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  TxHashStore,
  PermitStore,
  SettlementTracker,
} from "x402-megaeth-sdk";

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "2026-03-25"
}

// ─── TxHash Store (DynamoDB) ────────────────────

export class DynamoTxHashStore implements TxHashStore {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.docClient = client;
    this.tableName = tableName;
  }

  async checkAndMark(txHash: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            txHash,
            createdAt: nowEpoch(),
            expiresAt: nowEpoch() + SEVEN_DAYS_S,
          },
          ConditionExpression: "attribute_not_exists(txHash)",
        })
      );
      return true; // New — successfully marked
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return false; // Replay — already exists
      }
      throw err;
    }
  }
}

// ─── Permit Store (DynamoDB) ────────────────────

export class DynamoPermitStore implements PermitStore {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.docClient = client;
    this.tableName = tableName;
  }

  async checkAndMarkPending(sigKey: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            sigKey,
            status: "pending",
            createdAt: nowEpoch(),
            expiresAt: nowEpoch() + THIRTY_DAYS_S,
          },
          ConditionExpression: "attribute_not_exists(sigKey)",
        })
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw err;
    }
  }

  async markProcessed(sigKey: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { sigKey },
        UpdateExpression: "SET #status = :s, settledAt = :t",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":s": "processed", ":t": nowEpoch() },
      })
    );
  }

  async markFailed(sigKey: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { sigKey },
        UpdateExpression: "SET #status = :s, failedAt = :t",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":s": "failed", ":t": nowEpoch() },
      })
    );
  }
}

// ─── Settlement Tracker (DynamoDB) ──────────────

export class DynamoSettlementTracker implements SettlementTracker {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.docClient = client;
    this.tableName = tableName;
  }

  record(params: {
    scheme: string;
    asset: string;
    amountWei: string;
    payer: string;
    success: boolean;
    durationMs?: number;
  }): void {
    // Fire-and-forget: don't await, just log errors
    this._record(params).catch((err) =>
      console.error("[SettlementTracker] Failed to record stats:", err)
    );
  }

  private async _record(params: {
    scheme: string;
    asset: string;
    amountWei: string;
    payer: string;
    success: boolean;
    durationMs?: number;
  }): Promise<void> {
    const { scheme, asset, amountWei, success, durationMs } = params;
    const day = todayKey();

    const updates: Promise<unknown>[] = [
      // Global asset totals
      this.incrementCounter(`GLOBAL#${asset}`, "TOTAL", amountWei),
      // Daily breakdown
      this.incrementCounter(`GLOBAL#${asset}`, `DAILY#${day}`, amountWei),
      // Scheme totals
      this.incrementCounter(`SCHEME#${scheme}`, "TOTAL", amountWei),
      // Outcomes
      this.incrementOutcome(success),
    ];

    if (durationMs !== undefined && success) {
      updates.push(this.recordSettlementTime(durationMs));
    }

    await Promise.all(updates);
  }

  private async incrementCounter(
    pk: string,
    sk: string,
    amountWei: string
  ): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk, sk },
        UpdateExpression:
          "ADD #count :one, volumeWei :amount SET updatedAt = :now",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":amount": BigInt(amountWei),
          ":now": nowEpoch(),
        },
      })
    );
  }

  private async incrementOutcome(success: boolean): Promise<void> {
    const field = success ? "successCount" : "failureCount";
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: "OUTCOMES", sk: "TOTAL" },
        UpdateExpression: `ADD ${field} :one SET updatedAt = :now`,
        ExpressionAttributeValues: { ":one": 1, ":now": nowEpoch() },
      })
    );
  }

  private async recordSettlementTime(durationMs: number): Promise<void> {
    // Running average: store totalMs and count, compute avg on read
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: "SETTLEMENT_TIME", sk: "TOTAL" },
        UpdateExpression:
          "ADD totalMs :ms, #count :one SET updatedAt = :now",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":ms": durationMs,
          ":one": 1,
          ":now": nowEpoch(),
        },
      })
    );
  }

  /** Query stats for the /stats endpoint */
  async getStats(): Promise<Record<string, unknown>> {
    const result = await this.docClient.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "sk = :total",
        ExpressionAttributeValues: { ":total": "TOTAL" },
      })
    );

    const stats: Record<string, unknown> = {};
    for (const item of result.Items ?? []) {
      const key = item.pk as string;
      // Convert BigInt volumeWei to string for JSON serialization
      const entry = { ...item };
      if (entry.volumeWei !== undefined) {
        entry.volumeWei = String(entry.volumeWei);
      }
      stats[key] = entry;
    }

    // Add settlement time average
    const timeEntry = stats["SETTLEMENT_TIME"] as
      | { totalMs?: number; count?: number }
      | undefined;
    if (timeEntry?.totalMs && timeEntry?.count) {
      (stats["SETTLEMENT_TIME"] as Record<string, unknown>).avgMs =
        Math.round(timeEntry.totalMs / timeEntry.count);
    }

    return stats;
  }
}

// ─── Factory ────────────────────────────────────

export function createDynamoClient(region?: string): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: region || process.env.AWS_REGION || "ap-southeast-1",
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
