import { createHmac } from "node:crypto";
import { z } from "zod";

import { providerFetch } from "@/connectors/http";
import {
  credential,
  defaultNormalizedRecord,
  webhookJson,
  webhookTimestampIsFresh,
} from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";
import { constantTimeEqual } from "@/lib/crypto";

const accountSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable().optional(),
    business_profile: jsonObjectSchema.optional(),
  })
  .passthrough();
const listSchema = z
  .object({ data: z.array(jsonObjectSchema).default([]), has_more: z.boolean().default(false) })
  .passthrough();
const webhookEndpointSchema = z.object({ id: z.string(), secret: z.string() }).passthrough();

function apiKey(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return credential(context, "apiKey");
}

function headers(context: Parameters<Connector["validateCredentials"]>[0]): HeadersInit {
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey(context)}:`).toString("base64")}`,
    Accept: "application/json",
  };
}

function stripeTimestamp(record: Record<string, unknown>): string {
  const raw = record.created ?? record.created_at ?? Date.now() / 1_000;
  const numeric = Number(raw);
  return new Date(Number.isFinite(numeric) ? numeric * 1_000 : String(raw)).toISOString();
}

const stripeEventMapping: Record<string, string> = {
  "payment_intent.succeeded": "payment.succeeded",
  "payment_intent.payment_failed": "payment.failed",
  "invoice.paid": "invoice.paid",
  "customer.subscription.created": "subscription.changed",
  "customer.subscription.updated": "subscription.changed",
  "customer.subscription.deleted": "subscription.changed",
  "charge.refunded": "refund.created",
  "charge.dispute.created": "dispute.created",
};

function stripeEventObject(event: Record<string, unknown>): Record<string, unknown> {
  if (event.object !== "event") return event;
  const data = jsonObjectSchema.safeParse(event.data);
  const object = data.success ? jsonObjectSchema.safeParse(data.data.object) : null;
  return object?.success
    ? {
        ...object.data,
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        stripe_event_created: stripeTimestamp(event),
        livemode: event.livemode,
      }
    : event;
}

export const stripeConnector: Connector = {
  manifest: {
    id: "stripe",
    name: "Stripe",
    description: "Payments, subscriptions, invoices, refunds and disputes.",
    logo: "ST",
    authType: "api-key",
    apiVersion: "2025-06-30.basil",
    mappingVersion: 1,
    resources: ["payment", "invoice", "subscription", "refund", "dispute"],
    events: [
      "payment.succeeded",
      "payment.failed",
      "invoice.paid",
      "subscription.changed",
      "refund.created",
      "dispute.created",
    ],
    capabilities: ["api-key", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    return this.validateCredentials(context);
  },

  async validateCredentials(context) {
    const account = await providerFetch(
      "https://api.stripe.com/v1/account",
      { headers: headers(context) },
      accountSchema,
    );
    return {
      kind: "validated",
      externalAccountId: account.id,
      externalAccountName: String(account.business_profile?.name ?? account.email ?? account.id),
    };
  },

  async discoverResources(context) {
    const products = await providerFetch(
      "https://api.stripe.com/v1/products?limit=100&active=true",
      { headers: headers(context) },
      listSchema,
    );
    return products.data.map((product) => ({
      type: "product",
      externalId: String(product.id ?? ""),
      name: String(product.name ?? product.id ?? "Stripe product"),
    }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.stripe.com/v1/events?limit=${limit}`,
      { headers: headers(context) },
      listSchema,
    );
    return result.data.slice(0, limit).map(stripeEventObject);
  },

  async startBackfill(context, cursor) {
    const url = new URL("https://api.stripe.com/v1/events");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("starting_after", cursor);
    const result = await providerFetch(url.toString(), { headers: headers(context) }, listSchema);
    return {
      records: result.data,
      nextCursor: result.has_more ? String(result.data.at(-1)?.id ?? "") || null : null,
      highWatermark: result.data[0] ? stripeTimestamp(result.data[0]) : undefined,
    };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const body = new URLSearchParams({
      url: context.callbackUrl,
      description: `Namzi ${context.connectionId}`,
      "enabled_events[0]": "payment_intent.succeeded",
      "enabled_events[1]": "payment_intent.payment_failed",
      "enabled_events[2]": "invoice.paid",
      "enabled_events[3]": "customer.subscription.created",
      "enabled_events[4]": "customer.subscription.updated",
      "enabled_events[5]": "customer.subscription.deleted",
      "enabled_events[6]": "charge.refunded",
      "enabled_events[7]": "charge.dispute.created",
    });
    const endpoint = await providerFetch(
      "https://api.stripe.com/v1/webhook_endpoints",
      {
        method: "POST",
        headers: {
          ...headers(context),
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `namzi-webhook-${context.connectionId}`,
        },
        body,
      },
      webhookEndpointSchema,
      2,
    );
    return {
      externalId: endpoint.id,
      credentialUpdates: { webhookSigningKey: endpoint.secret },
    };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (!subscription.externalId) return;
    await providerFetch(
      `https://api.stripe.com/v1/webhook_endpoints/${subscription.externalId}`,
      { method: "DELETE", headers: headers(context) },
      jsonObjectSchema,
    );
  },

  async verifyWebhook(context, webhook) {
    const header = webhook.headers.get("stripe-signature");
    const secret = context.credentials.webhookSigningKey;
    if (!header || !secret) return false;
    const parts = header.split(",").map((part) => part.trim().split("=", 2));
    const timestamp = parts.find(([key]) => key === "t")?.[1];
    const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
    if (!timestamp || !webhookTimestampIsFresh(timestamp, 300)) return false;
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${webhook.rawBody}`)
      .digest("hex");
    return signatures.some((signature) =>
      Boolean(signature && constantTimeEqual(expected, signature)),
    );
  },

  async parseWebhook(_context, webhook) {
    const event = webhookJson(webhook);
    const type = String(event.type ?? "unknown");
    const object = jsonObjectSchema.parse(jsonObjectSchema.parse(event.data ?? {}).object ?? {});
    const occurredAt = stripeTimestamp(event);
    return [
      {
        providerEventId: String(event.id ?? `${type}:${object.id ?? occurredAt}`),
        eventType: stripeEventMapping[type] ?? `stripe.${type}`,
        eventAt: occurredAt,
        payload: {
          ...object,
          stripe_event_id: event.id,
          stripe_event_type: type,
          stripe_event_created: occurredAt,
          livemode: event.livemode,
        },
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    const rawType = String(record.type ?? record.stripe_event_type ?? "stripe.event");
    const normalizedEventType = eventType ?? stripeEventMapping[rawType] ?? `stripe.${rawType}`;
    const object = stripeEventObject(record);
    const normalized = defaultNormalizedRecord(
      {
        ...object,
        created_at: object.stripe_event_created ?? stripeTimestamp(record),
      },
      normalizedEventType.split(".")[0] ?? "event",
      normalizedEventType,
    );
    const amount = object.amount_received ?? object.amount_paid ?? object.amount ?? object.total;
    return {
      ...normalized,
      promoted: {
        ...normalized.promoted,
        amount: typeof amount === "number" ? String(amount / 100) : normalized.promoted?.amount,
        currency: typeof object.currency === "string" ? object.currency.toUpperCase() : undefined,
        status: typeof object.status === "string" ? object.status : undefined,
      },
    };
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Stripe connected",
      freshness: "live",
    };
  },

  async revokeCredentials() {
    // Restricted keys are revoked in Stripe; the encrypted local copy is removed by Namzi.
  },
};
