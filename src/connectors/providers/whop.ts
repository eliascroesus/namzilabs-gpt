import { createHmac } from "node:crypto";
import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import {
  credential,
  defaultNormalizedRecord,
  webhookJson,
  webhookTimestampIsFresh,
} from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";
import { constantTimeEqual } from "@/lib/crypto";

const listSchema = z
  .object({
    data: z.array(jsonObjectSchema).default([]),
    page_info: z
      .object({
        end_cursor: z.string().nullable().optional(),
        has_next_page: z.boolean().default(false),
      })
      .passthrough(),
  })
  .passthrough();
const webhookSchema = z.object({ id: z.string(), webhook_secret: z.string() }).passthrough();

function token(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return credential(context, "apiKey");
}

function companyId(context: Parameters<Connector["validateCredentials"]>[0]): string {
  const id = String(context.configuration.companyId ?? "").trim();
  if (!id) throw new Error("Whop company ID is required.");
  return id;
}

function base64Secret(value: string): Buffer {
  const raw = value.startsWith("whsec_") ? value.slice(6) : value;
  return Buffer.from(raw, "base64");
}

export const whopConnector: Connector = {
  manifest: {
    id: "whop",
    name: "Whop",
    description: "Memberships, payments, refunds, disputes and access lifecycle events.",
    logo: "WH",
    authType: "api-key",
    apiVersion: "v1",
    mappingVersion: 1,
    resources: ["membership", "payment", "refund", "dispute"],
    events: [
      "membership.activated",
      "membership.deactivated",
      "payment.succeeded",
      "payment.failed",
      "refund.created",
      "dispute.created",
    ],
    capabilities: ["api-key", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    return this.validateCredentials(context);
  },

  async validateCredentials(context) {
    const result = await providerFetch(
      `https://api.whop.com/api/v1/memberships?company_id=${encodeURIComponent(companyId(context))}&first=1`,
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    const first = result.data[0];
    const company = first ? jsonObjectSchema.safeParse(first.company) : null;
    return {
      kind: "validated",
      externalAccountId: companyId(context),
      externalAccountName: company?.success
        ? String(company.data.title ?? companyId(context))
        : companyId(context),
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      `https://api.whop.com/api/v1/memberships?company_id=${encodeURIComponent(companyId(context))}&first=100`,
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    const products = new Map<string, string>();
    for (const membership of result.data) {
      const product = jsonObjectSchema.safeParse(membership.product);
      if (product.success && product.data.id) {
        products.set(String(product.data.id), String(product.data.title ?? product.data.id));
      }
    }
    return [...products].map(([externalId, name]) => ({ type: "product", externalId, name }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.whop.com/api/v1/memberships?company_id=${encodeURIComponent(companyId(context))}&first=${limit}`,
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return result.data.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const url = new URL("https://api.whop.com/api/v1/memberships");
    url.searchParams.set("company_id", companyId(context));
    url.searchParams.set("first", "100");
    if (cursor) url.searchParams.set("after", cursor);
    const result = await providerFetch(
      url.toString(),
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return {
      records: result.data,
      nextCursor: result.page_info.has_next_page ? (result.page_info.end_cursor ?? null) : null,
    };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const result = await providerFetch(
      "https://api.whop.com/api/v1/webhooks",
      {
        method: "POST",
        headers: { ...bearerHeaders(token(context)), "Content-Type": "application/json" },
        body: JSON.stringify({
          url: context.callbackUrl,
          resource_id: companyId(context),
          child_resource_events: true,
          enabled: true,
          api_version: "v1",
          events: [
            "membership.activated",
            "membership.deactivated",
            "payment.succeeded",
            "payment.failed",
            "refund.created",
            "dispute.created",
            "dispute.updated",
          ],
        }),
      },
      webhookSchema,
      1,
    );
    return {
      externalId: result.id,
      credentialUpdates: { webhookSigningKey: result.webhook_secret },
    };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (!subscription.externalId) return;
    await fetch(`https://api.whop.com/api/v1/webhooks/${subscription.externalId}`, {
      method: "DELETE",
      headers: bearerHeaders(token(context)),
    });
  },

  async verifyWebhook(context, webhook) {
    const id = webhook.headers.get("webhook-id");
    const timestamp = webhook.headers.get("webhook-timestamp");
    const header = webhook.headers.get("webhook-signature");
    const secret = context.credentials.webhookSigningKey;
    if (!id || !timestamp || !header || !secret || !webhookTimestampIsFresh(timestamp, 300)) {
      return false;
    }
    const signedPayload = `${id}.${timestamp}.${webhook.rawBody}`;
    const signatures = header
      .split(" ")
      .map((part) => part.split(",").at(-1) ?? part)
      .map((signature) => signature.replace(/^v1,/, ""));
    // Whop follows the Standard Webhooks convention (`whsec_` + base64), while
    // accepting the raw secret here keeps verification compatible with older keys.
    return [base64Secret(secret), Buffer.from(secret.replace(/^whsec_/, ""))].some((key) => {
      const expected = createHmac("sha256", key).update(signedPayload).digest("base64");
      return signatures.some((signature) => constantTimeEqual(expected, signature));
    });
  },

  async parseWebhook(_context, webhook) {
    const body = webhookJson(webhook);
    const eventType = String(body.type ?? body.event ?? "unknown");
    const payload = jsonObjectSchema.parse(body.data ?? body.payload ?? {});
    const eventAt = String(
      body.created_at ?? payload.updated_at ?? payload.created_at ?? new Date().toISOString(),
    );
    return [
      {
        providerEventId:
          webhook.headers.get("webhook-id") ?? String(body.id ?? `${eventType}:${eventAt}`),
        eventType,
        eventAt,
        payload: { ...payload, whop_event_type: eventType },
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    const user = jsonObjectSchema.safeParse(record.user);
    const product = jsonObjectSchema.safeParse(record.product);
    return defaultNormalizedRecord(
      {
        ...record,
        name: user.success ? user.data.name : undefined,
        email: user.success ? user.data.email : undefined,
        campaign_id: product.success ? product.data.id : undefined,
      },
      eventType?.split(".")[0] ?? "membership",
      eventType,
    );
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Whop connected",
      freshness: "live",
    };
  },

  async revokeCredentials() {
    // Company keys are revoked in Whop; the encrypted local copy is removed by Namzi.
  },
};
