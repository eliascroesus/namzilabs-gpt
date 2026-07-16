import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { webhookConnector } from "@/connectors/providers/webhook";
import type { ConnectorContext } from "@/connectors/types";
import { deduplicationKey } from "@/server/ingestion/service";

const rawBody = JSON.stringify({
  id: "evt_1",
  type: "lead.created",
  createdAt: "2026-07-11T12:00:00Z",
});
const context: ConnectorContext = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  connectionId: "00000000-0000-4000-8000-000000000002",
  callbackUrl: "https://example.com/hook",
  credentials: { webhookSecret: "a-secure-webhook-secret-value" },
  configuration: { eventIdPath: "id", eventTypePath: "type", eventTimePath: "createdAt" },
};

describe("generic webhook", () => {
  it("accepts a normal provider POST in catch-hook mode", async () => {
    await expect(
      webhookConnector.verifyWebhook(context, { rawBody, headers: new Headers() }),
    ).resolves.toBe(true);
  });

  it("can require signed delivery when explicitly configured", async () => {
    await expect(
      webhookConnector.verifyWebhook(
        { ...context, configuration: { ...context.configuration, authenticationMode: "signed" } },
        { rawBody, headers: new Headers() },
      ),
    ).resolves.toBe(false);
  });

  it("accepts the configured secret header", async () => {
    const headers = new Headers({
      "x-namzi-webhook-secret": context.credentials.webhookSecret!,
      "x-namzi-timestamp": String(Math.floor(Date.now() / 1_000)),
    });
    await expect(webhookConnector.verifyWebhook(context, { rawBody, headers })).resolves.toBe(true);
  });

  it("accepts a valid HMAC and rejects a modified payload", async () => {
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = createHmac("sha256", context.credentials.webhookSecret!)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const headers = new Headers({
      "x-namzi-signature": `sha256=${signature}`,
      "x-namzi-timestamp": timestamp,
    });
    await expect(webhookConnector.verifyWebhook(context, { rawBody, headers })).resolves.toBe(true);
    await expect(
      webhookConnector.verifyWebhook(context, { rawBody: `${rawBody} `, headers }),
    ).resolves.toBe(false);
  });

  it("rejects a correctly signed replay outside the five-minute window", async () => {
    const timestamp = String(Math.floor(Date.now() / 1_000) - 301);
    const signature = createHmac("sha256", context.credentials.webhookSecret!)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const headers = new Headers({
      "x-namzi-signature": `sha256=${signature}`,
      "x-namzi-timestamp": timestamp,
    });
    await expect(webhookConnector.verifyWebhook(context, { rawBody, headers })).resolves.toBe(
      false,
    );
  });

  it("extracts configured fields and yields stable deduplication", async () => {
    const [event] = await webhookConnector.parseWebhook(context, {
      rawBody,
      headers: new Headers(),
    });
    expect(event).toMatchObject({
      providerEventId: "evt_1",
      eventType: "lead.created",
      eventAt: "2026-07-11T12:00:00.000Z",
    });
    expect(deduplicationKey(event!, rawBody)).toBe("provider:evt_1");
    expect(deduplicationKey(event!, rawBody)).toBe(deduplicationKey(event!, rawBody));
  });

  it("parses form payloads and flattens nested JSON into metric fields", async () => {
    const [form] = await webhookConnector.parseWebhook(context, {
      rawBody: "id=form_1&type=lead.created&email=test%40example.com",
      headers: new Headers({ "content-type": "application/x-www-form-urlencoded" }),
    });
    expect(form).toMatchObject({ providerEventId: "form_1", eventType: "lead.created" });

    const [nested] = await webhookConnector.parseWebhook(context, {
      rawBody: JSON.stringify({
        triggerEvent: "BOOKING_CREATED",
        payload: {
          uid: "booking_1",
          title: "Strategy call",
          startTime: "2026-07-16T12:00:00.000Z",
          attendees: [{ email: "lead@example.com" }],
        },
      }),
      headers: new Headers({ "content-type": "application/json" }),
    });
    expect(nested).toMatchObject({
      providerEventId: "booking_1",
      eventType: "BOOKING_CREATED",
      eventAt: "2026-07-16T12:00:00.000Z",
    });
    const normalized = await webhookConnector.normalizeRecord(
      context,
      nested!.payload,
      nested!.eventType,
    );
    expect(normalized.data).toMatchObject({
      "payload.title": "Strategy call",
      "payload.startTime": "2026-07-16T12:00:00.000Z",
      "payload.attendees.0.email": "lead@example.com",
    });
    expect(normalized.externalId).toBe("booking_1");
  });

  it("splits batched JSON arrays into independently deduplicated events", async () => {
    const events = await webhookConnector.parseWebhook(context, {
      rawBody: JSON.stringify([
        { id: "evt_1", type: "created" },
        { id: "evt_2", type: "updated" },
      ]),
      headers: new Headers({ "content-type": "application/json" }),
    });
    expect(events.map((event) => event.providerEventId)).toEqual(["evt_1", "evt_2"]);
  });

  it("captures query parameters and query-only test requests", async () => {
    const [event] = await webhookConnector.parseWebhook(context, {
      rawBody: "",
      headers: new Headers(),
      url: "https://example.com/api/webhooks/test?id=query_1&type=lead.created&source=browser",
    });
    expect(event).toMatchObject({
      providerEventId: "query_1",
      eventType: "lead.created",
      payload: { source: "browser" },
    });
  });
});
