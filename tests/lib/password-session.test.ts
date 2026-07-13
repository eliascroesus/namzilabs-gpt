import { describe, expect, it } from "vitest";

import {
  createPrototypeSession,
  passwordMatches,
  prototypeSessionMaxAgeSeconds,
  safeNextPath,
  verifyPrototypeSession,
} from "@/server/auth/password-session";

describe("prototype password session", () => {
  const password = "a-long-prototype-password";
  const now = Date.parse("2026-07-12T12:00:00Z");

  it("checks passwords without storing the password in the session value", () => {
    expect(passwordMatches(password, password)).toBe(true);
    expect(passwordMatches("wrong", password)).toBe(false);
    expect(createPrototypeSession(password, now)).not.toContain(password);
  });

  it("accepts a valid signed session and rejects tampering", () => {
    const session = createPrototypeSession(password, now);
    expect(verifyPrototypeSession(session, password, now + 60_000)).toBe(true);
    expect(verifyPrototypeSession(`${session}x`, password, now + 60_000)).toBe(false);
    expect(verifyPrototypeSession(session, "different-password", now + 60_000)).toBe(false);
  });

  it("expires sessions server-side after seven days", () => {
    const session = createPrototypeSession(password, now);
    expect(
      verifyPrototypeSession(
        session,
        password,
        now + prototypeSessionMaxAgeSeconds * 1_000 + 1_000,
      ),
    ).toBe(false);
  });

  it("only permits local redirect paths after login", () => {
    expect(safeNextPath("/metrics/new?from=login")).toBe("/metrics/new?from=login");
    expect(safeNextPath("https://evil.example")).toBe("/overview");
    expect(safeNextPath("//evil.example")).toBe("/overview");
  });
});
