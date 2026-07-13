import { createHmac } from "node:crypto";

import { constantTimeEqual, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import {
  defaultNormalizedRecord,
  randomSecret,
  webhookJson,
  webhookTimestampIsFresh,
} from "@/connectors/shared";
import type {
  AuthorizationResult,
  BackfillPage,
  Connector,
  ConnectorHealth,
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
    const timestamp = webhook.headers.get("x-namzi-timestamp");
    const tolerance = Number(context.configuration.webhookToleranceSeconds ?? 300);
    if (
      context.configuration.requireTimestamp !== false &&
      !webhookTimestampIsFresh(timestamp, Number.isFinite(tolerance) ? tolerance : 300)
    ) {
      return false;
    }
    const suppliedSecret = webhook.headers.get("x-namzi-webhook-secret");
    if (suppliedSecret) return constantTimeEqual(secret, suppliedSecret);

    const signature = webhook.headers.get("x-namzi-signature")?.replace(/^sha256=/, "");
    if (!signature) return false;
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
    const payload = webhookJson(webhook);
    const idValue = valueAtPath(payload, context.configuration.eventIdPath);
    const typeValue = valueAtPath(payload, context.configuration.eventTypePath);
    const timeValue = valueAtPath(payload, context.configuration.eventTimePath);
    return [
      {
        providerEventId: idValue === undefined ? sha256(webhook.rawBody) : String(idValue),
        eventType: typeValue === undefined ? "custom" : String(typeValue),
        ...(timeValue === undefined ? {} : { eventAt: String(timeValue) }),
        payload,
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    return defaultNormalizedRecord(record, "event", eventType ?? "custom");
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
