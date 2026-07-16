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

const meSchema = z
  .object({
    id: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    organizations: z.array(jsonObjectSchema).default([]),
  })
  .passthrough();
const listSchema = z
  .object({
    data: z.array(jsonObjectSchema).default([]),
    cursor_next: z.string().nullable().optional(),
  })
  .passthrough();
const subscriptionSchema = z
  .object({ id: z.string(), signature_key: z.string().optional() })
  .passthrough();

function token(context: Parameters<Connector["validateCredentials"]>[0]) {
  return credential(context, "accessToken");
}

export const closeConnector: Connector = {
  manifest: {
    id: "close",
    name: "Close CRM",
    description: "Leads, contacts, opportunities, calls, SMS and email activity.",
    logo: "CL",
    authType: "oauth2",
    apiVersion: "v1",
    mappingVersion: 1,
    resources: ["event"],
    events: ["lead.changed", "call.completed", "sms.sent", "email.sent", "opportunity.changed"],
    capabilities: ["oauth", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    const state = credential(context, "oauthState");
    const url = new URL("https://app.close.com/oauth2/authorize/");
    url.search = new URLSearchParams({
      client_id: env().CLOSE_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: `${env().APP_URL}/api/integrations/close/callback`,
      scope: "all.full_access offline_access",
      state,
    }).toString();
    return { kind: "redirect", url: url.toString(), state };
  },

  async validateCredentials(context) {
    const me = await providerFetch(
      "https://api.close.com/api/v1/me/",
      { headers: bearerHeaders(token(context)) },
      meSchema,
    );
    return {
      kind: "validated",
      externalAccountId: me.id,
      externalAccountName: [me.first_name, me.last_name].filter(Boolean).join(" "),
    };
  },

  async discoverResources(context) {
    const me = await providerFetch(
      "https://api.close.com/api/v1/me/",
      { headers: bearerHeaders(token(context)) },
      meSchema,
    );
    return me.organizations.map((organization) => ({
      type: "organization",
      externalId: String(organization.id ?? ""),
      name: String(organization.name ?? organization.id ?? "Close organization"),
    }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.close.com/api/v1/event/?_limit=${limit}`,
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return result.data.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const url = new URL("https://api.close.com/api/v1/event/");
    url.searchParams.set("_limit", "100");
    if (cursor) url.searchParams.set("_cursor", cursor);
    const result = await providerFetch(
      url.toString(),
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return { records: result.data, nextCursor: result.cursor_next ?? null };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const result = await providerFetch(
      "https://api.close.com/api/v1/webhook/",
      {
        method: "POST",
        headers: { ...bearerHeaders(token(context)), "Content-Type": "application/json" },
        body: JSON.stringify({
          url: context.callbackUrl,
          events: [
            { object_type: "lead", action: "created" },
            { object_type: "lead", action: "updated" },
            { object_type: "lead", action: "deleted" },
            { object_type: "contact", action: "created" },
            { object_type: "contact", action: "updated" },
            { object_type: "contact", action: "deleted" },
            { object_type: "opportunity", action: "created" },
            { object_type: "opportunity", action: "updated" },
            { object_type: "opportunity", action: "deleted" },
            { object_type: "activity.call", action: "created" },
            { object_type: "activity.call", action: "updated" },
            { object_type: "activity.sms", action: "created" },
            { object_type: "activity.sms", action: "updated" },
            { object_type: "activity.email", action: "created" },
            { object_type: "activity.email", action: "updated" },
          ],
        }),
      },
      subscriptionSchema,
      1,
    );
    return {
      externalId: result.id,
      credentialUpdates: result.signature_key
        ? { webhookSigningKey: result.signature_key }
        : undefined,
    };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (subscription.externalId)
      await fetch(`https://api.close.com/api/v1/webhook/${subscription.externalId}/`, {
        method: "DELETE",
        headers: bearerHeaders(token(context)),
      });
  },

  async verifyWebhook(context, webhook) {
    const hash = webhook.headers.get("close-sig-hash");
    const timestamp = webhook.headers.get("close-sig-timestamp");
    const keyHex = context.credentials.webhookSigningKey;
    if (!hash || !timestamp || !keyHex) return false;
    if (!webhookTimestampIsFresh(timestamp, 300)) return false;
    const expected = createHmac("sha256", Buffer.from(keyHex, "hex"))
      .update(timestamp + webhook.rawBody)
      .digest("hex");
    return constantTimeEqual(expected, hash);
  },

  async parseWebhook(_context, webhook) {
    const body = webhookJson(webhook);
    const event = jsonObjectSchema.parse(body.event ?? body);
    const objectType = String(event.object_type ?? "record");
    const action = String(event.action ?? "changed");
    return [
      {
        providerEventId: String(
          event.id ??
            `${objectType}:${event.object_id ?? "unknown"}:${event.date_updated ?? event.date_created ?? ""}`,
        ),
        eventType: `${objectType}.${action}`,
        eventAt: String(event.date_updated ?? event.date_created ?? new Date().toISOString()),
        payload: event,
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    return defaultNormalizedRecord(record, "event", eventType);
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Close connected",
      freshness: "live",
    };
  },

  async revokeCredentials(context) {
    const refreshToken = context.credentials.refreshToken;
    if (!refreshToken) return;
    await fetch("https://api.close.com/oauth2/revoke/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env().CLOSE_CLIENT_ID ?? "",
        client_secret: env().CLOSE_CLIENT_SECRET ?? "",
        token: refreshToken,
      }),
    });
  },
};
