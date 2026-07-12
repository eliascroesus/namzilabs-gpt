import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { AppError } from "@/lib/errors";

export type EncryptedValue = {
  algorithm: "aes-256-gcm";
  keyVersion: number;
  iv: string;
  authTag: string;
  ciphertext: string;
};

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.byteLength !== 32) {
    throw new AppError("invalid_encryption_key", "The encryption key must be 32 bytes.", 500);
  }
  return key;
}

export function encryptSecret(
  plaintext: string,
  keyBase64: string,
  keyVersion = 1,
): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(keyBase64), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    keyVersion,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(value: EncryptedValue, keyBase64: string): string {
  const decipher = createDecipheriv(
    value.algorithm,
    decodeKey(keyBase64),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
