import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { brevoConnector } from "@/connectors/providers/brevo";
import { calComConnector } from "@/connectors/providers/cal-com";
import { closeConnector } from "@/connectors/providers/close";
import { googleCalendarConnector } from "@/connectors/providers/google-calendar";
import { stripeConnector } from "@/connectors/providers/stripe";
import { whopConnector } from "@/connectors/providers/whop";
import type { ConnectorContext } from "@/connectors/types";

const rawBody = JSON.stringify({ id: "evt_1", type: "record.changed" });
const baseContext: ConnectorContext = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  connectionId: "00000000-0000-4000-8000-000000000002",
  callbackUrl: "https://example.com/hook",
  credentials: {},
  configuration: {},
};

function context(credentials: Record<string, string>): ConnectorContext {
  return { ...baseContext, credentials };
}

describe("provider webhook verification", () => {
  it("verifies Stripe signatures and rejects a changed payload", async () => {
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const secret = "whsec_stripe_test_secret";
    const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const headers = new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` });
    const stripeContext = context({ webhookSigningKey: secret });

    await expect(stripeConnector.verifyWebhook(stripeContext, { rawBody, headers })).resolves.toBe(
      true,
    );
    await expect(
      stripeConnector.verifyWebhook(stripeContext, { rawBody: `${rawBody} `, headers }),
    ).resolves.toBe(false);
  });

  it("verifies Close signatures with the returned hex signing key", async () => {
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const key = Buffer.from("close-test-signing-key");
    const hash = createHmac("sha256", key)
      .update(timestamp + rawBody)
      .digest("hex");
    const headers = new Headers({
      "close-sig-hash": hash,
      "close-sig-timestamp": timestamp,
    });

    await expect(
      closeConnector.verifyWebhook(context({ webhookSigningKey: key.toString("hex") }), {
        rawBody,
        headers,
      }),
    ).resolves.toBe(true);
  });

  it("verifies Whop Standard Webhooks signatures", async () => {
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const id = "msg_test_1";
    const key = Buffer.from("whop-test-signing-key");
    const secret = `whsec_${key.toString("base64")}`;
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64");
    const headers = new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    });

    await expect(
      whopConnector.verifyWebhook(context({ webhookSigningKey: secret }), { rawBody, headers }),
    ).resolves.toBe(true);
  });

  it("verifies Cal.com HMAC signatures", async () => {
    const secret = "cal-com-test-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    const headers = new Headers({ "x-cal-signature-256": signature });

    await expect(
      calComConnector.verifyWebhook(context({ webhookSecret: secret }), { rawBody, headers }),
    ).resolves.toBe(true);
  });

  it("verifies Google Calendar channel tokens", async () => {
    const secret = "google-calendar-channel-token";
    const headers = new Headers({ "x-goog-channel-token": secret });

    await expect(
      googleCalendarConnector.verifyWebhook(context({ webhookSecret: secret }), {
        rawBody,
        headers,
      }),
    ).resolves.toBe(true);
  });

  it("verifies Brevo bearer webhook authentication", async () => {
    const secret = "brevo-webhook-bearer-token";
    const headers = new Headers({ authorization: `Bearer ${secret}` });

    await expect(
      brevoConnector.verifyWebhook(context({ webhookSecret: secret }), { rawBody, headers }),
    ).resolves.toBe(true);
  });
});
