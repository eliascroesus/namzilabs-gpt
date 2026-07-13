import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

import type { ProviderId } from "@/connectors/types";
import { sha256 } from "@/lib/crypto";
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

const oauthStateVersion = "v1";
const oauthStateAad = Buffer.from("namzi-oauth-state:v1");

function encryptionKey(): Buffer {
  const encoded = env().ENCRYPTION_KEY_BASE64;
  if (!encoded)
    throw new AppError(
      "encryption_not_configured",
      "OAuth state encryption is not configured.",
      503,
    );
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32) {
    throw new AppError(
      "encryption_not_configured",
      "OAuth state encryption is not configured.",
      503,
    );
  }
  return key;
}

function invalidOAuthState(): AppError {
  return new AppError("invalid_oauth_state", "OAuth state is invalid.", 400);
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
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(oauthStateAad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    oauthStateVersion,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openOAuthState(value: string): OAuthState {
  const [version, ivValue, authTagValue, ciphertextValue, extra] = value.split(".");
  if (version !== oauthStateVersion || !ivValue || !authTagValue || !ciphertextValue || extra) {
    throw invalidOAuthState();
  }

  let parsed: OAuthState;
  try {
    const iv = Buffer.from(ivValue, "base64url");
    const authTag = Buffer.from(authTagValue, "base64url");
    if (iv.byteLength !== 12 || authTag.byteLength !== 16) throw invalidOAuthState();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(oauthStateAad);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    parsed = stateSchema.parse(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidOAuthState();
  }

  if (parsed.expiresAt < Date.now())
    throw new AppError("expired_oauth_state", "OAuth state expired.", 400);
  return parsed;
}
