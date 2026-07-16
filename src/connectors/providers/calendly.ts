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
import { env } from "@/lib/env";

const currentUserSchema = z.object({
  resource: z.object({
    uri: z.string(),
    name: z.string(),
    current_organization: z.string(),
  }),
});
const collectionSchema = z.object({
  collection: z.array(jsonObjectSchema).default([]),
  pagination: z.object({ next_page_token: z.string().nullable().optional() }).optional(),
});
const webhookSchema = z.object({ resource: z.object({ uri: z.string() }) });

function token(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return credential(context, "accessToken");
}

async function organizationUri(
  context: Parameters<Connector["validateCredentials"]>[0],
): Promise<string> {
  const configured = String(context.configuration.organizationUri ?? "").trim();
  if (configured) return configured;
  const user = await providerFetch(
    "https://api.calendly.com/users/me",
    { headers: bearerHeaders(token(context)) },
    currentUserSchema,
  );
  return user.resource.current_organization;
}

export const calendlyConnector: Connector = {
  manifest: {
    id: "calendly",
    name: "Calendly",
    description: "Bookings, cancellations, reschedules and invitee data.",
    logo: "CA",
    authType: "oauth2",
    apiVersion: "v2",
    mappingVersion: 1,
    resources: ["scheduled_event"],
    events: ["meeting.booked", "meeting.canceled", "meeting.rescheduled", "meeting.no_show"],
    capabilities: ["oauth", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    const state = credential(context, "oauthState");
    const verifierChallenge = credential(context, "pkceChallenge");
    const url = new URL("https://auth.calendly.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: env().CALENDLY_CLIENT_ID ?? "",
      redirect_uri: `${env().APP_URL}/api/integrations/calendly/callback`,
      response_type: "code",
      scope: "scheduled_events:read invitees:read webhooks:write",
      code_challenge_method: "S256",
      code_challenge: verifierChallenge,
      state,
    }).toString();
    return { kind: "redirect", url: url.toString(), state };
  },

  async validateCredentials(context) {
    const result = await providerFetch(
      "https://api.calendly.com/users/me",
      { headers: bearerHeaders(token(context)) },
      currentUserSchema,
    );
    return {
      kind: "validated",
      externalAccountId: result.resource.uri,
      externalAccountName: result.resource.name,
    };
  },

  async discoverResources(context) {
    const user = await providerFetch(
      "https://api.calendly.com/users/me",
      { headers: bearerHeaders(token(context)) },
      currentUserSchema,
    );
    return [{ type: "user", externalId: user.resource.uri, name: user.resource.name }];
  },

  async fetchSample(context, limit) {
    const organization = encodeURIComponent(await organizationUri(context));
    const result = await providerFetch(
      `https://api.calendly.com/scheduled_events?organization=${organization}&count=${limit}&sort=start_time:desc`,
      { headers: bearerHeaders(token(context)) },
      collectionSchema,
    );
    return result.collection.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const organization = encodeURIComponent(await organizationUri(context));
    const page = cursor ? `&page_token=${encodeURIComponent(cursor)}` : "";
    const result = await providerFetch(
      `https://api.calendly.com/scheduled_events?organization=${organization}&count=100${page}`,
      { headers: bearerHeaders(token(context)) },
      collectionSchema,
    );
    return { records: result.collection, nextCursor: result.pagination?.next_page_token ?? null };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const organization = await organizationUri(context);
    const result = await providerFetch(
      "https://api.calendly.com/webhook_subscriptions",
      {
        method: "POST",
        headers: { ...bearerHeaders(token(context)), "Content-Type": "application/json" },
        body: JSON.stringify({
          url: context.callbackUrl,
          events: ["invitee.created", "invitee.canceled"],
          organization,
          scope: "organization",
        }),
      },
      webhookSchema,
      1,
    );
    return { externalId: result.resource.uri };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (!subscription.externalId) return;
    await fetch(subscription.externalId, {
      method: "DELETE",
      headers: bearerHeaders(token(context)),
    });
  },

  async verifyWebhook(_context, webhook) {
    const header = webhook.headers.get("calendly-webhook-signature");
    const secret = env().CALENDLY_WEBHOOK_SIGNING_KEY;
    if (!header || !secret) return false;
    const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
    if (!parts.t || !parts.v1) return false;
    if (!webhookTimestampIsFresh(parts.t, 300)) return false;
    const expected = createHmac("sha256", secret)
      .update(`${parts.t}.${webhook.rawBody}`)
      .digest("hex");
    return constantTimeEqual(expected, parts.v1);
  },

  async parseWebhook(_context, webhook) {
    const body = webhookJson(webhook);
    const event = String(body.event ?? "unknown");
    const payload = jsonObjectSchema.parse(body.payload ?? {});
    const inviteeUri = String(payload.uri ?? "");
    const mapped = event === "invitee.created" ? "meeting.booked" : "meeting.canceled";
    return [
      {
        providerEventId: `${event}:${inviteeUri}`,
        eventType: mapped,
        eventAt: String(payload.created_at ?? new Date().toISOString()),
        payload: { ...payload, calendly_event: event },
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    return defaultNormalizedRecord(record, "scheduled_event", eventType ?? "meeting.booked");
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    const webhookAvailable = context.configuration.webhookAvailable !== false;
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: webhookAvailable ? "Calendly connected" : "Polling fallback active",
      freshness: webhookAvailable ? "live" : "delayed",
    };
  },

  async revokeCredentials(context) {
    const refreshToken = context.credentials.refreshToken;
    if (!refreshToken) return;
    await fetch("https://auth.calendly.com/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  },
};
