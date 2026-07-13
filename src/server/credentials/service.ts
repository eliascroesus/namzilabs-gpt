import { and, eq } from "drizzle-orm";

import { encryptedCredentials } from "@/db/schema";
import type { Database } from "@/db/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

function encryptionKey(): string {
  const key = env().ENCRYPTION_KEY_BASE64;
  if (!key)
    throw new AppError(
      "encryption_not_configured",
      "Credential encryption is not configured.",
      503,
    );
  return key;
}

export function previousEncryptionKeys(value: string): Record<number, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppError(
      "invalid_encryption_keyring",
      "Previous credential encryption keys must be valid JSON.",
      500,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError(
      "invalid_encryption_keyring",
      "Previous credential encryption keys must be a JSON object.",
      500,
    );
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([version, key]) => {
      const numericVersion = Number(version);
      if (!Number.isInteger(numericVersion) || numericVersion < 1 || typeof key !== "string") {
        throw new AppError(
          "invalid_encryption_keyring",
          "Previous credential encryption key versions are invalid.",
          500,
        );
      }
      return [numericVersion, key];
    }),
  );
}

function currentKeyVersion(): number {
  return env().ENCRYPTION_KEY_VERSION;
}

function encryptionKeyForVersion(version: number): string {
  if (version === currentKeyVersion()) return encryptionKey();
  const key = previousEncryptionKeys(env().ENCRYPTION_PREVIOUS_KEYS_JSON)[version];
  if (!key) {
    throw new AppError(
      "credential_key_unavailable",
      `Credential encryption key version ${version} is unavailable.`,
      503,
    );
  }
  return key;
}

export async function storeCredential(
  db: Database,
  input: {
    organizationId: string;
    connectionId: string;
    type: string;
    value: string;
    expiresAt?: Date;
  },
): Promise<void> {
  const encrypted = encryptSecret(input.value, encryptionKey(), currentKeyVersion());
  await db
    .insert(encryptedCredentials)
    .values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      credentialType: input.type,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      algorithm: encrypted.algorithm,
      keyVersion: encrypted.keyVersion,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        encryptedCredentials.organizationId,
        encryptedCredentials.connectionId,
        encryptedCredentials.credentialType,
      ],
      set: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        expiresAt: input.expiresAt,
        updatedAt: new Date(),
      },
    });
}

export async function loadCredentials(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(encryptedCredentials)
    .where(
      and(
        eq(encryptedCredentials.organizationId, organizationId),
        eq(encryptedCredentials.connectionId, connectionId),
      ),
    );
  return Object.fromEntries(
    rows.map((row) => [
      row.credentialType,
      decryptSecret(
        {
          algorithm: "aes-256-gcm",
          keyVersion: row.keyVersion,
          iv: row.iv,
          authTag: row.authTag,
          ciphertext: row.ciphertext,
        },
        encryptionKeyForVersion(row.keyVersion),
      ),
    ]),
  );
}

export async function rotateStoredCredentials(db: Database): Promise<number> {
  const targetVersion = currentKeyVersion();
  const rows = await db.select().from(encryptedCredentials);
  let rotated = 0;
  for (const row of rows.filter((credential) => credential.keyVersion !== targetVersion)) {
    const plaintext = decryptSecret(
      {
        algorithm: "aes-256-gcm",
        keyVersion: row.keyVersion,
        iv: row.iv,
        authTag: row.authTag,
        ciphertext: row.ciphertext,
      },
      encryptionKeyForVersion(row.keyVersion),
    );
    const encrypted = encryptSecret(plaintext, encryptionKey(), targetVersion);
    await db
      .update(encryptedCredentials)
      .set({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        algorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(encryptedCredentials.id, row.id),
          eq(encryptedCredentials.keyVersion, row.keyVersion),
        ),
      );
    rotated += 1;
  }
  return rotated;
}

export async function deleteCredentials(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<void> {
  await db
    .delete(encryptedCredentials)
    .where(
      and(
        eq(encryptedCredentials.organizationId, organizationId),
        eq(encryptedCredentials.connectionId, connectionId),
      ),
    );
}
