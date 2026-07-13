import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const prototypeSessionCookieName = "namzi_prototype_session";
export const prototypeSessionMaxAgeSeconds = 7 * 24 * 60 * 60;

const keyLength = 32;
const scryptOptions = {
  N: 1 << 15,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

let cachedSessionPassword: string | undefined;
let cachedSessionKey: Buffer | undefined;

function derivePasswordKey(
  password: string,
  purpose: "password-check" | "session-signing",
): Buffer {
  return scryptSync(password, `namzi-password-wall:${purpose}:v1`, keyLength, scryptOptions);
}

function sessionKey(password: string): Buffer {
  if (cachedSessionPassword !== password || !cachedSessionKey) {
    cachedSessionPassword = password;
    cachedSessionKey = derivePasswordKey(password, "session-signing");
  }
  return cachedSessionKey;
}

function sessionSignature(password: string, issuedAt: number): Buffer {
  return createHmac("sha256", sessionKey(password))
    .update(`namzi-password-wall:v1:${issuedAt}`)
    .digest();
}

export function passwordMatches(candidate: string, expected: string): boolean {
  const candidateKey = derivePasswordKey(candidate, "password-check");
  const expectedKey = derivePasswordKey(expected, "password-check");
  return timingSafeEqual(candidateKey, expectedKey);
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
