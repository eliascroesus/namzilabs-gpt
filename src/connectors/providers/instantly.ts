import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import {
  credential,
  defaultNormalizedRecord,
  randomSecret,
  webhookJson,
} from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";
import { constantTimeEqual } from "@/lib/crypto";

const listSchema = z
  .object({
    items: z.array(jsonObjectSchema).default([]),
    next_starting_after: z.string().nullable().optional(),
  })
  .passthrough();
const objectSchema = jsonObjectSchema;
const webhookSchema = z.object({ id: z.string() }).passthrough();

function token(context: Parameters<Connector["validateCredentials"]>[0]) {
  return credential(context, "apiKey");
}

export const instantlyConnector: Connector = {
  manifest: {
    id: "instantly",
    name: "Instantly",
    description: "Campaign, lead and outreach engagement data through API v2.",
    logo: "IN",
    authType: "api-key",
    apiVersion: "v2",
    mappingVersion: 1,
    resources: ["lead", "email"],
    events: [
      "email.sent",
      "email.opened",
      "email.clicked",
      "email.bounced",
      "email.replied",
      "lead.unsubscribed",
      "meeting.booked",
      "campaign.completed",
    ],
    capabilities: ["api-key", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    return this.validateCredentials(context);
  },

  async validateCredentials(context) {
    const workspace = await providerFetch(
      "https://api.instantly.ai/api/v2/workspaces/current",
      { headers: bearerHeaders(token(context)) },
      objectSchema,
    );
    return {
      kind: "validated",
      externalAccountId: String(workspace.id ?? workspace.workspace_id ?? "instantly-workspace"),
      externalAccountName: String(workspace.name ?? "Instantly workspace"),
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      "https://api.instantly.ai/api/v2/campaigns?limit=100",
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return result.items.map((campaign) => ({
      type: "campaign",
      externalId: String(campaign.id ?? ""),
      name: String(campaign.name ?? campaign.id ?? "Campaign"),
    }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.instantly.ai/api/v2/leads?limit=${limit}`,
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return result.items.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const url = new URL("https://api.instantly.ai/api/v2/leads");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("starting_after", cursor);
    const result = await providerFetch(
      url.toString(),
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return { records: result.items, nextCursor: result.next_starting_after ?? null };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const secret = context.credentials.webhookSecret ?? randomSecret();
    const result = await providerFetch(
      "https://api.instantly.ai/api/v2/webhooks",
      {
        method: "POST",
        headers: { ...bearerHeaders(token(context)), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Namzi ${context.connectionId}`,
          target_hook_url: context.callbackUrl,
          event_type: "all_events",
          headers: { "x-namzi-webhook-secret": secret },
        }),
      },
      webhookSchema,
      1,
    );
    return { externalId: result.id, credentialUpdates: { webhookSecret: secret } };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (subscription.externalId)
      await fetch(`https://api.instantly.ai/api/v2/webhooks/${subscription.externalId}`, {
        method: "DELETE",
        headers: bearerHeaders(token(context)),
      });
  },

  async verifyWebhook(context, webhook) {
    const supplied = webhook.headers.get("x-namzi-webhook-secret");
    const expected = context.credentials.webhookSecret;
    return Boolean(supplied && expected && constantTimeEqual(supplied, expected));
  },

  async parseWebhook(_context, webhook) {
    const payload = webhookJson(webhook);
    const sourceType = String(payload.event_type ?? "unknown");
    const mapping: Record<string, string> = {
      email_sent: "email.sent",
      email_opened: "email.opened",
      email_link_clicked: "email.clicked",
      email_bounced: "email.bounced",
      reply_received: "email.replied",
      lead_unsubscribed: "lead.unsubscribed",
      meeting_booked: "meeting.booked",
      campaign_completed: "campaign.completed",
    };
    const occurredAt = String(payload.timestamp ?? new Date().toISOString());
    const id = String(payload.id ?? `${sourceType}:${payload.lead_email ?? ""}:${occurredAt}`);
    return [
      {
        providerEventId: id,
        eventType: mapping[sourceType] ?? `instantly.${sourceType}`,
        eventAt: occurredAt,
        payload,
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    return defaultNormalizedRecord(
      record,
      eventType?.startsWith("email.") ? "email" : "lead",
      eventType,
    );
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Instantly API v2 connected",
      freshness: "live",
    };
  },

  async revokeCredentials() {
    // Instantly API keys are revoked by the customer in Instantly; the local encrypted copy is deleted by the service layer.
  },
};
