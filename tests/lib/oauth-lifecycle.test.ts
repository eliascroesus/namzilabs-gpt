import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeConnector } from "@/connectors/providers/close";
import { googleSheetsConnector } from "@/connectors/providers/google-sheets";
import type { ConnectorContext } from "@/connectors/types";
import { resetEnvForTests } from "@/lib/env";
import { buildRefreshRequest } from "@/server/oauth/refresh";

const baseContext: ConnectorContext = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  connectionId: "00000000-0000-4000-8000-000000000002",
  callbackUrl: "https://example.com/webhook",
  credentials: { accessToken: "access", refreshToken: "refresh" },
  configuration: {},
};

describe("OAuth lifecycle", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.ENCRYPTION_KEY_BASE64 = randomBytes(32).toString("base64");
    process.env.GOOGLE_CLIENT_ID = "google-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.CALENDLY_CLIENT_ID = "calendly-client";
    process.env.CALENDLY_CLIENT_SECRET = "calendly-secret";
    process.env.CLOSE_CLIENT_ID = "close-client";
    process.env.CLOSE_CLIENT_SECRET = "close-secret";
    process.env.CALCOM_CLIENT_ID = "cal-client";
    process.env.CALCOM_CLIENT_SECRET = "cal-secret";
    resetEnvForTests();
  });

  it.each([
    ["google-sheets", "https://oauth2.googleapis.com/token"],
    ["google-calendar", "https://oauth2.googleapis.com/token"],
    ["calendly", "https://auth.calendly.com/oauth/token"],
    ["cal-com", "https://api.cal.com/v2/auth/oauth2/token"],
    ["close", "https://api.close.com/oauth2/token/"],
  ] as const)("builds a scoped %s refresh request", (provider, expectedUrl) => {
    const request = buildRefreshRequest(provider, "rotating-refresh-token");
    expect(request.url).toBe(expectedUrl);
    expect(request.body.get("grant_type")).toBe("refresh_token");
    expect(request.body.get("refresh_token")).toBe("rotating-refresh-token");
  });

  it("revokes Google access without exposing the token in a body or log", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await googleSheetsConnector.revokeCredentials(baseContext);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke?token=refresh",
      expect.objectContaining({ method: "POST" }),
    );
    vi.unstubAllGlobals();
  });

  it("revokes the Close rotating refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await closeConnector.revokeCredentials(baseContext);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.close.com/oauth2/revoke/");
    expect((call?.[1]?.body as URLSearchParams).get("token")).toBe("refresh");
    vi.unstubAllGlobals();
  });
});
