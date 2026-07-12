import { describe, expect, it } from "vitest";
import {
  chooseIdentityMatch,
  normalizeEmail,
  normalizeIdentitySignal,
  normalizePhone,
} from "@/server/identity/service";

describe("deterministic identity resolution", () => {
  it("normalizes only safe exact identifiers", () => {
    expect(normalizeEmail("  ELIAS@NamziLabs.co ")).toBe("elias@namzilabs.co");
    expect(normalizeEmail("not-email")).toBeNull();
    expect(normalizePhone("+46 (70) 123-45-67")).toBe("+46701234567");
    expect(normalizePhone("0701234567")).toBeNull();
    expect(
      normalizeIdentitySignal({ type: "provider_external_id", provider: "calendly", value: "abc" }),
    ).toEqual({ type: "provider_external_id", value: "calendly:abc" });
  });

  it("never automatically merges ambiguous exact signals", () => {
    expect(
      chooseIdentityMatch([
        { entityId: "person-a", locked: false },
        { entityId: "person-b", locked: false },
      ]),
    ).toEqual({ kind: "ambiguous", entityIds: ["person-a", "person-b"] });
    expect(
      chooseIdentityMatch([
        { entityId: "person-a", locked: true },
        { entityId: "person-a", locked: false },
      ]),
    ).toEqual({ kind: "matched", entityId: "person-a" });
  });
});
