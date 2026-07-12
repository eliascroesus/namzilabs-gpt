import { z } from "zod";

import { providerFetch } from "@/connectors/http";
import {
  credential,
  defaultNormalizedRecord,
  randomSecret,
  webhookJson,
} from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";
import { constantTimeEqual } from "@/lib/crypto";

const accountSchema = z
  .object({
    email: z.string(),
    companyName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .passthrough();
const contactsSchema = z
  .object({ contacts: z.array(jsonObjectSchema).default([]), count: z.number().optional() })
  .passthrough();
const campaignsSchema = z
  .object({ campaigns: z.array(jsonObjectSchema).default([]) })
  .passthrough();
const webhookSchema = z.object({ id: z.number() }).passthrough();

function headers(context: Parameters<Connector["validateCredentials"]>[0]): HeadersInit {
  return { "api-key": credential(context, "apiKey"), Accept: "application/json" };
}

export const brevoConnector: Connector = {
  manifest: {
    id: "brevo",
    name: "Brevo",
    description: "Transactional and marketing email, SMS and contact events.",
    logo: "BR",
    authType: "api-key",
    apiVersion: "v3",
    mappingVersion: 1,
    resources: ["account", "contact", "campaign", "message"],
    events: [
      "email.sent",
      "email.delivered",
      "email.opened",
      "email.clicked",
      "email.bounced",
      "contact.unsubscribed",
      "contact.changed",
      "sms.sent",
      "sms.delivered",
    ],
    capabilities: ["api-key", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    return this.validateCredentials(context);
  },

  async validateCredentials(context) {
    const account = await providerFetch(
      "https://api.brevo.com/v3/account",
      { headers: headers(context) },
      accountSchema,
    );
    return {
      kind: "validated",
      externalAccountId: account.email,
      externalAccountName:
        account.companyName ?? [account.firstName, account.lastName].filter(Boolean).join(" "),
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      "https://api.brevo.com/v3/emailCampaigns?limit=100&offset=0",
      { headers: headers(context) },
      campaignsSchema,
    );
    return result.campaigns.map((campaign) => ({
      type: "campaign",
      externalId: String(campaign.id ?? ""),
      name: String(campaign.name ?? campaign.id ?? "Campaign"),
    }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.brevo.com/v3/contacts?limit=${limit}&offset=0`,
      { headers: headers(context) },
      contactsSchema,
    );
    return result.contacts.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const offset = Number(cursor ?? "0");
    const result = await providerFetch(
      `https://api.brevo.com/v3/contacts?limit=500&offset=${offset}`,
      { headers: headers(context) },
      contactsSchema,
    );
    const next = result.contacts.length === 500 ? String(offset + 500) : null;
    return { records: result.contacts, nextCursor: next };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const secret = context.credentials.webhookSecret ?? randomSecret();
    const result = await providerFetch(
      "https://api.brevo.com/v3/webhooks",
      {
        method: "POST",
        headers: { ...headers(context), "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `Namzi ${context.connectionId}`,
          url: context.callbackUrl,
          type: "transactional",
          events: [
            "sent",
            "delivered",
            "opened",
            "click",
            "hardBounce",
            "softBounce",
            "unsubscribed",
          ],
          auth: { type: "bearer", token: secret },
        }),
      },
      webhookSchema,
    );
    return { externalId: String(result.id) };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (subscription.externalId)
      await fetch(`https://api.brevo.com/v3/webhooks/${subscription.externalId}`, {
        method: "DELETE",
        headers: headers(context),
      });
  },

  async verifyWebhook(context, webhook) {
    const authorization = webhook.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const custom = webhook.headers.get("x-namzi-webhook-secret");
    const supplied = authorization ?? custom;
    const expected = context.credentials.webhookSecret;
    return Boolean(supplied && expected && constantTimeEqual(supplied, expected));
  },

  async parseWebhook(_context, webhook) {
    const payload = webhookJson(webhook);
    const sourceType = String(payload.event ?? payload.msg_status ?? "unknown");
    const mapping: Record<string, string> = {
      sent: "email.sent",
      delivered: "email.delivered",
      opened: "email.opened",
      click: "email.clicked",
      hardBounce: "email.bounced",
      softBounce: "email.bounced",
      unsubscribed: "contact.unsubscribed",
      contactUpdated: "contact.changed",
      contactDeleted: "contact.deleted",
    };
    const occurredAt = new Date(
      Number(payload.ts_event ?? payload.ts ?? Date.now() / 1_000) * 1_000,
    ).toISOString();
    const id = `${payload["message-id"] ?? payload.messageId ?? payload.email ?? "event"}:${sourceType}:${payload.ts_event ?? payload.ts ?? ""}`;
    return [
      {
        providerEventId: id,
        eventType: mapping[sourceType] ?? `brevo.${sourceType}`,
        eventAt: occurredAt,
        payload,
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    return defaultNormalizedRecord(
      record,
      eventType?.startsWith("email.") ? "message" : "contact",
      eventType,
    );
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Brevo connected",
      freshness: "live",
    };
  },

  async revokeCredentials() {
    // Brevo API keys are revoked in Brevo; the local encrypted copy is deleted by the service layer.
  },
};
