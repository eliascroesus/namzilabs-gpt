import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import { credential, defaultNormalizedRecord, subscriptionId } from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";
import { constantTimeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

const profileSchema = z.object({ sub: z.string(), email: z.string(), name: z.string().optional() });
const calendarListSchema = z
  .object({ items: z.array(jsonObjectSchema).default([]), nextPageToken: z.string().optional() })
  .passthrough();
const eventListSchema = z
  .object({
    items: z.array(jsonObjectSchema).default([]),
    nextPageToken: z.string().optional(),
    nextSyncToken: z.string().optional(),
  })
  .passthrough();
const channelSchema = z
  .object({ id: z.string(), resourceId: z.string(), expiration: z.string().optional() })
  .passthrough();

function accessToken(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return credential(context, "accessToken");
}

function calendarId(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return String(context.configuration.calendarId ?? "primary");
}

function eventTime(event: Record<string, unknown>): string {
  const start = jsonObjectSchema.safeParse(event.start);
  return String(
    (start.success ? (start.data.dateTime ?? start.data.date) : undefined) ??
      event.created ??
      event.updated ??
      new Date().toISOString(),
  );
}

export const googleCalendarConnector: Connector = {
  manifest: {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Events, invitees and accepted, declined or tentative responses.",
    logo: "GC",
    authType: "oauth2",
    apiVersion: "v3",
    mappingVersion: 1,
    resources: ["event"],
    events: ["calendar.changed", "event.created", "event.updated", "event.canceled"],
    capabilities: ["oauth", "webhooks", "polling", "backfill", "sample", "subscription-renewal"],
  },

  async authorize(context) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID ?? "",
      redirect_uri: `${env().APP_URL}/api/integrations/google-calendar/callback`,
      response_type: "code",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      code_challenge_method: "S256",
      code_challenge: credential(context, "pkceChallenge"),
      state: credential(context, "oauthState"),
    }).toString();
    return { kind: "redirect", url: url.toString(), state: credential(context, "oauthState") };
  },

  async validateCredentials(context) {
    const profile = await providerFetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: bearerHeaders(accessToken(context)) },
      profileSchema,
    );
    return {
      kind: "validated",
      externalAccountId: profile.sub,
      externalAccountName: profile.name ?? profile.email,
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      { headers: bearerHeaders(accessToken(context)) },
      calendarListSchema,
    );
    return result.items.map((calendar) => ({
      type: "calendar",
      externalId: String(calendar.id ?? ""),
      name: String(calendar.summaryOverride ?? calendar.summary ?? calendar.id ?? "Calendar"),
      metadata: {
        primary: calendar.primary === true,
        accessRole: calendar.accessRole,
        timeZone: calendar.timeZone,
      },
    }));
  },

  async fetchSample(context, limit) {
    const now = encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString());
    const result = await providerFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId(context))}/events?singleEvents=true&orderBy=startTime&timeMin=${now}&maxResults=${limit}`,
      { headers: bearerHeaders(accessToken(context)) },
      eventListSchema,
    );
    return result.items.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId(context))}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "250");
    if (cursor?.startsWith("sync:")) {
      url.searchParams.set("syncToken", cursor.slice(5));
    } else if (cursor) {
      url.searchParams.set("pageToken", cursor);
    } else {
      url.searchParams.set("timeMin", new Date(Date.now() - 2 * 365 * 86_400_000).toISOString());
    }
    const result = await providerFetch(
      url.toString(),
      { headers: bearerHeaders(accessToken(context)) },
      eventListSchema,
    );
    return {
      records: result.items,
      nextCursor: result.nextPageToken ?? null,
      checkpoint: result.nextSyncToken ? `sync:${result.nextSyncToken}` : undefined,
      highWatermark: new Date().toISOString(),
    };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const id = subscriptionId();
    const expiresAt = Date.now() + 6.5 * 24 * 60 * 60 * 1_000;
    const result = await providerFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId(context))}/events/watch`,
      {
        method: "POST",
        headers: { ...bearerHeaders(accessToken(context)), "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          type: "web_hook",
          address: context.callbackUrl,
          token: credential(context, "webhookSecret"),
          expiration: String(expiresAt),
        }),
      },
      channelSchema,
      1,
    );
    return {
      externalId: result.id,
      resourceId: result.resourceId,
      expiresAt: result.expiration
        ? new Date(Number(result.expiration)).toISOString()
        : new Date(expiresAt).toISOString(),
      metadata: { calendarId: calendarId(context) },
    };
  },

  async renewSubscription(context) {
    return this.createSubscription(context);
  },

  async deleteSubscription(context, subscription) {
    if (!subscription.externalId || !subscription.resourceId) return;
    await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: { ...bearerHeaders(accessToken(context)), "Content-Type": "application/json" },
      body: JSON.stringify({ id: subscription.externalId, resourceId: subscription.resourceId }),
    });
  },

  async verifyWebhook(context, webhook) {
    const supplied = webhook.headers.get("x-goog-channel-token");
    return Boolean(
      supplied &&
      context.credentials.webhookSecret &&
      constantTimeEqual(supplied, context.credentials.webhookSecret),
    );
  },

  async parseWebhook(_context, webhook) {
    const state = webhook.headers.get("x-goog-resource-state") ?? "exists";
    const channel = webhook.headers.get("x-goog-channel-id") ?? "unknown";
    const message = webhook.headers.get("x-goog-message-number") ?? "unknown";
    return [
      {
        providerEventId: `${channel}:${message}`,
        eventType: "calendar.changed",
        eventAt: new Date().toISOString(),
        payload: {
          channel_id: channel,
          message_number: message,
          resource_id: webhook.headers.get("x-goog-resource-id"),
          resource_state: state,
          resource_uri: webhook.headers.get("x-goog-resource-uri"),
        },
      },
    ];
  },

  async normalizeRecord(_context, record, eventType) {
    if (eventType === "calendar.changed") {
      return defaultNormalizedRecord(record, "calendar_notification", eventType);
    }
    const attendees = Array.isArray(record.attendees)
      ? record.attendees.map((attendee) => jsonObjectSchema.parse(attendee))
      : [];
    const accepted = attendees.filter((attendee) => attendee.responseStatus === "accepted");
    const declined = attendees.filter((attendee) => attendee.responseStatus === "declined");
    const tentative = attendees.filter((attendee) => attendee.responseStatus === "tentative");
    const occurredAt = eventTime(record);
    const mappedEvent =
      record.status === "cancelled"
        ? "event.canceled"
        : record.created === record.updated
          ? "event.created"
          : "event.updated";
    const normalized = defaultNormalizedRecord(
      {
        ...record,
        created_at: occurredAt,
        attendee_count: attendees.length,
        accepted_count: accepted.length,
        declined_count: declined.length,
        tentative_count: tentative.length,
        accepted_attendees: accepted,
        declined_attendees: declined,
        tentative_attendees: tentative,
      },
      "calendar_event",
      eventType ?? mappedEvent,
    );
    return {
      ...normalized,
      isDeleted: record.status === "cancelled",
      promoted: {
        ...normalized.promoted,
        displayName: typeof record.summary === "string" ? record.summary : undefined,
        status: typeof record.status === "string" ? record.status : undefined,
      },
    };
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Google Calendar connected",
      freshness: "live",
    };
  },

  async revokeCredentials(context) {
    const token = context.credentials.refreshToken ?? context.credentials.accessToken;
    if (!token) return;
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
};
