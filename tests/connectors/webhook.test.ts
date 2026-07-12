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
  it("accepts the configured secret header", async () => {
    const headers = new Headers({ "x-namzi-webhook-secret": context.credentials.webhookSecret! });
    await expect(webhookConnector.verifyWebhook(context, { rawBody, headers })).resolves.toBe(true);
  });

  it("accepts a valid HMAC and rejects a modified payload", async () => {
    const signature = createHmac("sha256", context.credentials.webhookSecret!)
      .update(rawBody)
      .digest("hex");
    const headers = new Headers({ "x-namzi-signature": `sha256=${signature}` });
    await expect(webhookConnector.verifyWebhook(context, { rawBody, headers })).resolves.toBe(true);
    await expect(
      webhookConnector.verifyWebhook(context, { rawBody: `${rawBody} `, headers }),
    ).resolves.toBe(false);
  });

  it("extracts configured fields and yields stable deduplication", async () => {
    const [event] = await webhookConnector.parseWebhook(context, {
      rawBody,
      headers: new Headers(),
    });
    expect(event).toMatchObject({
      providerEventId: "evt_1",
      eventType: "lead.created",
      eventAt: "2026-07-11T12:00:00Z",
    });
    expect(deduplicationKey(event!, rawBody)).toBe("provider:evt_1");
    expect(deduplicationKey(event!, rawBody)).toBe(deduplicationKey(event!, rawBody));
  });
});
