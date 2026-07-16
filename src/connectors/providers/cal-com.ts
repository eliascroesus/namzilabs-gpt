import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import { credential, defaultNormalizedRecord, webhookJson, verifyHmac } from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";
import { env } from "@/lib/env";

const profileSchema = z.object({ status: z.string(), data: jsonObjectSchema }).passthrough();
const collectionSchema = z
  .object({
    status: z.string(),
    data: z.array(jsonObjectSchema).default([]),
    pagination: z
      .object({ nextCursor: z.string().nullable().optional(), hasMore: z.boolean().optional() })
      .optional(),
  })
  .passthrough();
const webhookSchema = z
  .object({
    status: z.string(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),
  })
  .passthrough();

function accessToken(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return credential(context, "accessToken");
}

function calHeaders(context: Parameters<Connector["validateCredentials"]>[0], version: string) {
  return { ...bearerHeaders(accessToken(context)), "cal-api-version": version };
}

export const calComConnector: Connector = {
  manifest: {
    id: "cal-com",
    name: "Cal.com",
    description: "Bookings, attendees, event types, cancellations and reschedules.",
    logo: "CC",
    authType: "oauth2",
    apiVersion: "v2",
    mappingVersion: 1,
    resources: ["booking"],
    events: ["meeting.booked", "meeting.canceled", "meeting.rescheduled", "meeting.no_show"],
    capabilities: ["oauth", "webhooks", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    const url = new URL("https://app.cal.com/auth/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: env().CALCOM_CLIENT_ID ?? "",
      redirect_uri: `${env().APP_URL}/api/integrations/cal-com/callback`,
      response_type: "code",
      scope: "PROFILE_READ BOOKING_READ EVENT_TYPE_READ WEBHOOK_READ WEBHOOK_WRITE",
      state: credential(context, "oauthState"),
    }).toString();
    return { kind: "redirect", url: url.toString(), state: credential(context, "oauthState") };
  },

  async validateCredentials(context) {
    const profile = await providerFetch(
      "https://api.cal.com/v2/me",
      { headers: calHeaders(context, "2024-08-13") },
      profileSchema,
    );
    return {
      kind: "validated",
      externalAccountId: String(profile.data.id ?? profile.data.email ?? "cal-user"),
      externalAccountName: String(
        profile.data.name ?? profile.data.username ?? profile.data.email ?? "Cal.com",
      ),
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      "https://api.cal.com/v2/event-types?take=100",
      { headers: calHeaders(context, "2024-06-14") },
      collectionSchema,
    );
    return result.data.map((eventType) => ({
      type: "event_type",
      externalId: String(eventType.id ?? eventType.slug ?? ""),
      name: String(eventType.title ?? eventType.slug ?? eventType.id ?? "Cal.com event type"),
    }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.cal.com/v2/bookings?take=${limit}`,
      { headers: calHeaders(context, "2026-05-01") },
      collectionSchema,
    );
    return result.data.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const url = new URL("https://api.cal.com/v2/bookings");
    url.searchParams.set("take", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await providerFetch(
      url.toString(),
      { headers: calHeaders(context, "2026-05-01") },
      collectionSchema,
    );
    return {
      records: result.data,
      nextCursor: result.pagination?.hasMore ? (result.pagination.nextCursor ?? null) : null,
    };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const result = await providerFetch(
      "https://api.cal.com/v2/webhooks",
      {
        method: "POST",
        headers: { ...calHeaders(context, "2021-10-20"), "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriberUrl: context.callbackUrl,
          active: true,
          triggers: [
            "BOOKING_CREATED",
            "BOOKING_CANCELLED",
            "BOOKING_RESCHEDULED",
            "BOOKING_NO_SHOW_UPDATED",
          ],
          secret: credential(context, "webhookSecret"),
          version: "2021-10-20",
        }),
      },
      webhookSchema,
      1,
    );
    return { externalId: String(result.data.id) };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription(context, subscription) {
    if (!subscription.externalId) return;
    await fetch(`https://api.cal.com/v2/webhooks/${subscription.externalId}`, {
      method: "DELETE",
      headers: calHeaders(context, "2021-10-20"),
    });
  },

  async verifyWebhook(context, webhook) {
    return verifyHmac(
      webhook.rawBody,
      webhook.headers.get("x-cal-signature-256"),
      credential(context, "webhookSecret"),
    );
  },

  async parseWebhook(_context, webhook) {
    const body = webhookJson(webhook);
    const trigger = String(body.triggerEvent ?? body.trigger_event ?? body.type ?? "unknown");
    const payload = jsonObjectSchema.parse(body.payload ?? body.data ?? {});
    const mapping: Record<string, string> = {
      BOOKING_CREATED: "meeting.booked",
      BOOKING_CANCELLED: "meeting.canceled",
      BOOKING_RESCHEDULED: "meeting.rescheduled",
      BOOKING_NO_SHOW_UPDATED: "meeting.no_show",
    };
    const eventAt = String(
      payload.updatedAt ??
        payload.updated_at ??
        payload.createdAt ??
        payload.created_at ??
        new Date().toISOString(),
    );
    return [
      {
        providerEventId: String(body.id ?? `${trigger}:${payload.uid ?? payload.id ?? eventAt}`),
        eventType: mapping[trigger] ?? `cal.${trigger.toLowerCase()}`,
        eventAt,
        payload: { ...payload, cal_trigger: trigger },
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    const attendees = Array.isArray(record.attendees) ? record.attendees : [];
    const first = jsonObjectSchema.safeParse(attendees[0]).success
      ? jsonObjectSchema.parse(attendees[0])
      : {};
    const occurredAt = String(
      record.start ??
        record.startTime ??
        record.start_time ??
        record.createdAt ??
        record.created_at ??
        new Date().toISOString(),
    );
    return defaultNormalizedRecord(
      {
        ...record,
        id: record.uid ?? record.id,
        created_at: occurredAt,
        name: first.name ?? record.title,
        email: first.email,
      },
      "booking",
      eventType ?? "meeting.booked",
    );
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Cal.com connected",
      freshness: "live",
    };
  },

  async revokeCredentials() {
    // Cal.com OAuth access is revoked from the connected app settings.
  },
};
