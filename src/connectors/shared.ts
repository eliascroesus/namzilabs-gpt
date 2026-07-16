import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { constantTimeEqual, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { ConnectorContext, IncomingWebhook, NormalizedRecord } from "@/connectors/types";

export function credential(context: ConnectorContext, key: string): string {
  const value = context.credentials[key];
  if (!value) throw new AppError("credential_missing", `Missing provider credential: ${key}.`, 401);
  return value;
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function verifyHmac(
  rawBody: string,
  supplied: string | null,
  secret: string,
  algorithm: "sha256" | "sha1" = "sha256",
  prefix = "",
): boolean {
  if (!supplied) return false;
  const expected = `${prefix}${createHmac(algorithm, secret).update(rawBody).digest("hex")}`;
  return constantTimeEqual(expected, supplied);
}

export function webhookTimestampIsFresh(
  value: string | null,
  toleranceSeconds = 300,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric)
    ? numeric > 10_000_000_000
      ? numeric
      : numeric * 1_000
    : Date.parse(value);
  return Number.isFinite(parsed) && Math.abs(now - parsed) <= toleranceSeconds * 1_000;
}

export function webhookJson(webhook: IncomingWebhook): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(webhook.rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError("invalid_webhook_json", "Webhook bodies must contain a JSON object.", 400);
  }
}

/**
 * Store nested provider fields as addressable dot paths. Raw webhook payloads remain
 * unchanged in raw_events; this representation is for source records and the metric
 * builder, where PostgreSQL can query a stable top-level JSON key such as
 * `payload.booking.startTime`.
 */
export function flattenDataRecord(
  record: Record<string, unknown>,
  options: { maxDepth?: number; maxFields?: number } = {},
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const maxDepth = options.maxDepth ?? 8;
  const maxFields = options.maxFields ?? 500;

  function visit(value: unknown, path: string, depth: number): void {
    if (!path || Object.keys(output).length >= maxFields || path.length > 235) return;
    if (value === null || typeof value !== "object") {
      output[path] = value;
      return;
    }
    if (depth >= maxDepth) {
      output[path] = value;
      return;
    }
    if (Array.isArray(value)) {
      output[path] = value;
      value.slice(0, 25).forEach((item, index) => visit(item, `${path}.${index}`, depth + 1));
      return;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) output[path] = value;
    for (const [key, child] of entries) {
      visit(child, `${path}.${key}`, depth + 1);
    }
  }

  for (const [key, value] of Object.entries(record)) visit(value, key, 0);
  return output;
}

export function defaultNormalizedRecord(
  record: Record<string, unknown>,
  resourceType: string,
  eventType?: string,
): NormalizedRecord {
  const flattened = flattenDataRecord(record);
  const queryableRecord = { ...record, ...flattened };
  const externalId = String(
    record.id ?? record.uuid ?? record.uri ?? sha256(JSON.stringify(record)),
  );
  const timestamp = String(
    record.updated_at ??
      record.timestamp_updated ??
      record.created_at ??
      record.timestamp ??
      new Date().toISOString(),
  );
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : undefined;
  const rawPhone = typeof record.phone === "string" ? record.phone : undefined;
  const phoneDigits = rawPhone?.replace(/[^0-9+]/g, "");
  const amount = record.amount ?? record.value ?? record.revenue;
  return {
    resourceType,
    externalId,
    sourceUpdatedAt: timestamp,
    occurredAt: timestamp,
    isDeleted: eventType?.includes("deleted") === true || eventType?.includes("canceled") === true,
    data: queryableRecord,
    promoted: {
      displayName:
        typeof record.name === "string"
          ? record.name
          : [record.first_name, record.last_name]
              .filter((value) => typeof value === "string")
              .join(" ") || undefined,
      normalizedEmail: email,
      normalizedPhone: phoneDigits?.startsWith("+") ? phoneDigits : undefined,
      status: typeof record.status === "string" ? record.status : undefined,
      ownerExternalId: typeof record.user_id === "string" ? record.user_id : undefined,
      campaignExternalId: typeof record.campaign_id === "string" ? record.campaign_id : undefined,
      amount: typeof amount === "number" || typeof amount === "string" ? String(amount) : undefined,
      currency: typeof record.currency === "string" ? record.currency.toUpperCase() : undefined,
    },
    ...(eventType
      ? {
          activity: {
            type: eventType,
            externalId: `${eventType}:${externalId}`,
            occurredAt: timestamp,
            dimensions: queryableRecord,
            promoted: {
              status: typeof record.status === "string" ? record.status : undefined,
              channel: typeof record.channel === "string" ? record.channel : undefined,
              ownerId: typeof record.user_id === "string" ? record.user_id : undefined,
              amount:
                typeof amount === "number" || typeof amount === "string"
                  ? String(amount)
                  : undefined,
              durationSeconds:
                typeof record.duration === "number"
                  ? Math.max(0, Math.round(record.duration))
                  : undefined,
            },
          },
        }
      : {}),
  };
}

export function subscriptionId(): string {
  return randomUUID();
}
