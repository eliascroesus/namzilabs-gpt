import { createHmac } from "node:crypto";

import { constantTimeEqual, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import {
  defaultNormalizedRecord,
  flattenDataRecord,
  randomSecret,
  webhookTimestampIsFresh,
} from "@/connectors/shared";
import type {
  AuthorizationResult,
  BackfillPage,
  Connector,
  ConnectorHealth,
  IncomingWebhook,
  ParsedWebhookEvent,
  SubscriptionResult,
} from "@/connectors/types";

function valueAtPath(payload: Record<string, unknown>, path: unknown): unknown {
  if (typeof path !== "string" || !path) return undefined;
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, payload);
}

function firstValueAtPaths(payload: Record<string, unknown>, paths: unknown[]): unknown {
  for (const path of paths) {
    const value = valueAtPath(payload, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function recordFromValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

export function parseCatchHookBody(webhook: IncomingWebhook): Record<string, unknown>[] {
  const body = webhook.rawBody.trim();
  const contentType = webhook.headers.get("content-type")?.toLocaleLowerCase() ?? "";
  const query = webhook.url
    ? Object.fromEntries(new URL(webhook.url).searchParams.entries())
    : ({} as Record<string, string>);
  if (!body) {
    if (Object.keys(query).length) return [query];
    throw new AppError("empty_webhook", "The webhook did not contain any data.", 400);
  }

  let records: Record<string, unknown>[];

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    const payload: Record<string, unknown> = {};
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      payload[key] = values.length === 1 ? values[0] : values;
    }
    records = [payload];
  } else if (contentType.includes("json") || body.startsWith("{") || body.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(body);
      records = Array.isArray(parsed) ? parsed.map(recordFromValue) : [recordFromValue(parsed)];
    } catch {
      throw new AppError("invalid_webhook_json", "The webhook contained invalid JSON.", 400);
    }
  } else if (contentType.includes("xml") || body.startsWith("<")) {
    records = [{ raw_xml: body }];
  } else {
    records = [{ raw_text: body }];
  }
  return Object.keys(query).length ? records.map((record) => ({ ...query, ...record })) : records;
}

function validEventTime(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export const webhookConnector: Connector = {
  manifest: {
    id: "webhook",
    name: "Webhook",
    description: "Receive JSON events from any service with a secure endpoint.",
    logo: "WH",
    authType: "webhook-secret",
    apiVersion: "2026-07",
    mappingVersion: 1,
    resources: ["event"],
    events: ["custom"],
    capabilities: ["webhooks", "sample"],
  },

  async authorize(): Promise<AuthorizationResult> {
    return {
      kind: "validated",
      externalAccountId: randomSecret(18),
      externalAccountName: "Webhook",
    };
  },

  async validateCredentials(context): Promise<AuthorizationResult> {
    const secret = context.credentials.webhookSecret;
    if (!secret || secret.length < 24) {
      throw new AppError(
        "weak_webhook_secret",
        "Webhook secrets must be at least 24 characters.",
        400,
      );
    }
    return {
      kind: "validated",
      externalAccountId: context.connectionId,
      externalAccountName: "Webhook",
    };
  },

  async discoverResources() {
    return [{ type: "event", externalId: "default", name: "Incoming JSON events" }];
  },

  async fetchSample(context, limit) {
    const samples = context.configuration.recentPayloads;
    if (!Array.isArray(samples)) return [];
    return samples
      .filter(
        (sample): sample is Record<string, unknown> =>
          Boolean(sample) && typeof sample === "object",
      )
      .slice(0, limit);
  },

  async startBackfill(): Promise<BackfillPage> {
    return { records: [], nextCursor: null };
  },

  async continueBackfill(): Promise<BackfillPage> {
    return { records: [], nextCursor: null };
  },

  async createSubscription(context): Promise<SubscriptionResult> {
    return { externalId: context.connectionId, metadata: { callbackUrl: context.callbackUrl } };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription() {},

  async verifyWebhook(context, webhook) {
    const secret = context.credentials.webhookSecret;
    if (!secret) return false;
    const authenticationMode = String(context.configuration.authenticationMode ?? "catch-url");
    const timestamp = webhook.headers.get("x-namzi-timestamp");
    const tolerance = Number(context.configuration.webhookToleranceSeconds ?? 300);
    const suppliedSecret = webhook.headers.get("x-namzi-webhook-secret");
    if (suppliedSecret) {
      if (
        timestamp &&
        !webhookTimestampIsFresh(timestamp, Number.isFinite(tolerance) ? tolerance : 300)
      ) {
        return false;
      }
      return constantTimeEqual(secret, suppliedSecret);
    }

    const signature = webhook.headers.get("x-namzi-signature")?.replace(/^sha256=/, "");
    if (!signature) return authenticationMode !== "signed";
    if (
      context.configuration.requireTimestamp !== false &&
      !webhookTimestampIsFresh(timestamp, Number.isFinite(tolerance) ? tolerance : 300)
    ) {
      return false;
    }
    const signedBody = timestamp ? `${timestamp}.${webhook.rawBody}` : webhook.rawBody;
    const expected = createHmac("sha256", secret).update(signedBody).digest("hex");
    if (constantTimeEqual(expected, signature)) return true;
    if (context.configuration.allowLegacySignature === true) {
      const legacy = createHmac("sha256", secret).update(webhook.rawBody).digest("hex");
      return constantTimeEqual(legacy, signature);
    }
    return false;
  },

  async parseWebhook(context, webhook): Promise<ParsedWebhookEvent[]> {
    return parseCatchHookBody(webhook).map((payload, index) => {
      const idValue = firstValueAtPaths(payload, [
        context.configuration.eventIdPath,
        "id",
        "event_id",
        "eventId",
        "uuid",
        "data.id",
        "payload.id",
        "payload.uid",
      ]);
      const typeValue = firstValueAtPaths(payload, [
        context.configuration.eventTypePath,
        "type",
        "event",
        "event_type",
        "eventType",
        "triggerEvent",
        "payload.type",
      ]);
      const timeValue = firstValueAtPaths(payload, [
        context.configuration.eventTimePath,
        "createdAt",
        "created_at",
        "timestamp",
        "occurred_at",
        "data.created_at",
        "payload.createdAt",
        "payload.created_at",
        "payload.startTime",
        "payload.start_time",
      ]);
      return {
        providerEventId:
          idValue === undefined ? sha256(`${webhook.rawBody}:${index}`) : String(idValue),
        eventType: typeValue === undefined ? "custom" : String(typeValue),
        ...(validEventTime(timeValue) ? { eventAt: validEventTime(timeValue) } : {}),
        payload,
      };
    });
  },

  async normalizeRecord(_context, record, eventType) {
    const flattened = flattenDataRecord(record);
    const id = firstValueAtPaths(record, [
      "id",
      "event_id",
      "eventId",
      "uuid",
      "data.id",
      "payload.id",
      "payload.uid",
    ]);
    const timestamp = firstValueAtPaths(record, [
      "createdAt",
      "created_at",
      "timestamp",
      "occurred_at",
      "data.created_at",
      "payload.createdAt",
      "payload.created_at",
      "payload.startTime",
      "payload.start_time",
    ]);
    const promoted = {
      id: id ?? sha256(JSON.stringify(record)),
      created_at: validEventTime(timestamp) ?? new Date().toISOString(),
      name: firstValueAtPaths(record, ["name", "data.name", "payload.name", "payload.title"]),
      email: firstValueAtPaths(record, ["email", "data.email", "payload.email"]),
      phone: firstValueAtPaths(record, ["phone", "data.phone", "payload.phone"]),
      status: firstValueAtPaths(record, ["status", "data.status", "payload.status"]),
    };
    const normalized = defaultNormalizedRecord(promoted, "event", eventType ?? "custom");
    return {
      ...normalized,
      data: flattened,
      ...(normalized.activity
        ? { activity: { ...normalized.activity, dimensions: flattened } }
        : {}),
    };
  },

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Endpoint ready",
      freshness: "live",
    };
  },

  async revokeCredentials() {},
};

export function genericWebhookCurl(callbackUrl: string, secret: string): string {
  return `curl -X POST '${callbackUrl}' -H 'content-type: application/json' -H 'x-namzi-webhook-secret: ${secret}' -H "x-namzi-timestamp: $(date +%s)" -d '{"event":"example","id":"evt_123"}'`;
}
