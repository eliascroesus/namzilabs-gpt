import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

import type { ProviderId } from "@/connectors/types";
import { constantTimeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const stateSchema = z.object({
  state: z.string().min(32),
  verifier: z.string().min(43),
  provider: z.enum(["google-sheets", "calendly", "close"]),
  organizationId: z.uuid(),
  connectionId: z.uuid(),
  expiresAt: z.number().int(),
});

export type OAuthState = z.infer<typeof stateSchema>;

function signingKey(): Buffer {
  const encoded = env().ENCRYPTION_KEY_BASE64;
  if (!encoded)
    throw new AppError("encryption_not_configured", "OAuth state signing is not configured.", 503);
  return Buffer.from(encoded, "base64");
}

export function createOAuthState(
  provider: Extract<ProviderId, "google-sheets" | "calendly" | "close">,
  organizationId: string,
  connectionId: string,
): OAuthState {
  return {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    provider,
    organizationId,
    connectionId,
    expiresAt: Date.now() + 10 * 60_000,
  };
}

export function pkceChallenge(verifier: string): string {
  return Buffer.from(sha256(verifier), "hex").toString("base64url");
}

export function sealOAuthState(value: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function openOAuthState(value: string): OAuthState {
  const [payload, supplied] = value.split(".");
  if (!payload || !supplied)
    throw new AppError("invalid_oauth_state", "OAuth state is invalid.", 400);
  const expected = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  if (!constantTimeEqual(expected, supplied)) {
    throw new AppError("invalid_oauth_state", "OAuth state is invalid.", 400);
  }
  const parsed = stateSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (parsed.expiresAt < Date.now())
    throw new AppError("expired_oauth_state", "OAuth state expired.", 400);
  return parsed;
}
