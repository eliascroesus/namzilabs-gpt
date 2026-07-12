import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { redactSensitive } from "@/lib/redaction";

describe("credential protection", () => {
  it("round trips AES-256-GCM without storing plaintext", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptSecret("super-secret-token", key);
    expect(encrypted.ciphertext).not.toContain("super-secret-token");
    expect(decryptSecret(encrypted, key)).toBe("super-secret-token");
  });

  it("redacts secrets and raw PII payloads recursively", () => {
    expect(
      redactSensitive({
        authorization: "Bearer abc",
        nested: { apiKey: "abc", safe: "ok" },
        payload: { email: "person@example.com" },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", safe: "ok" },
      payload: "[REDACTED]",
    });
  });
});
