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
  const encrypted = encryptSecret(input.value, encryptionKey());
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
  const key = encryptionKey();
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
        key,
      ),
    ]),
  );
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
