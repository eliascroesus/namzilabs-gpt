import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const prototypeSessionCookieName = "namzi_prototype_session";
export const prototypeSessionMaxAgeSeconds = 7 * 24 * 60 * 60;

function sessionSignature(password: string, issuedAt: number): Buffer {
  return createHmac("sha256", password).update(`namzi-password-wall:v1:${issuedAt}`).digest();
}

export function passwordMatches(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export function createPrototypeSession(password: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1_000);
  return `${issuedAt}.${sessionSignature(password, issuedAt).toString("base64url")}`;
}

export function verifyPrototypeSession(
  value: string | undefined,
  password: string | undefined,
  now = Date.now(),
): boolean {
  if (!value || !password) return false;
  const [issuedAtValue, suppliedValue, extra] = value.split(".");
  if (!issuedAtValue || !suppliedValue || extra) return false;
  const issuedAt = Number(issuedAtValue);
  const nowSeconds = Math.floor(now / 1_000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt > nowSeconds + 60 ||
    nowSeconds - issuedAt > prototypeSessionMaxAgeSeconds
  ) {
    return false;
  }
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedValue, "base64url");
  } catch {
    return false;
  }
  const expected = sessionSignature(password, issuedAt);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/overview";
  return value;
}
