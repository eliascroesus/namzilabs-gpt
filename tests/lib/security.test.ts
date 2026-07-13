import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { webhookTimestampIsFresh } from "@/connectors/shared";
import { previousEncryptionKeys } from "@/server/credentials/service";
import { trustedRequestOrigin } from "@/server/security/csrf";

describe("request and credential security", () => {
  it("accepts only same-origin browser mutations", () => {
    const request = (origin?: string, fetchSite?: string) => ({
      method: "POST",
      url: "https://namzilabs.co/api/connections",
      headers: new Headers({
        ...(origin ? { origin } : {}),
        ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
      }),
    });
    expect(
      trustedRequestOrigin(request("https://namzilabs.co", "same-origin"), "https://namzilabs.co"),
    ).toBe(true);
    expect(
      trustedRequestOrigin(request("https://evil.example", "cross-site"), "https://namzilabs.co"),
    ).toBe(false);
    expect(trustedRequestOrigin(request(undefined, undefined), "https://namzilabs.co", true)).toBe(
      false,
    );
  });

  it("parses versioned previous keys and rejects malformed keyrings", () => {
    const key = randomBytes(32).toString("base64");
    expect(previousEncryptionKeys(JSON.stringify({ 1: key }))[1]).toBe(key);
    expect(() => previousEncryptionKeys("[]")).toThrow("JSON object");
    expect(() => previousEncryptionKeys('{"nope":42}')).toThrow("versions are invalid");
  });

  it("accepts seconds, milliseconds and ISO timestamps only within tolerance", () => {
    const now = Date.parse("2026-07-12T12:00:00Z");
    expect(webhookTimestampIsFresh(String(now / 1_000), 300, now)).toBe(true);
    expect(webhookTimestampIsFresh(String(now), 300, now)).toBe(true);
    expect(webhookTimestampIsFresh("2026-07-12T11:59:00Z", 300, now)).toBe(true);
    expect(webhookTimestampIsFresh("2026-07-12T11:54:59Z", 300, now)).toBe(false);
  });
});
