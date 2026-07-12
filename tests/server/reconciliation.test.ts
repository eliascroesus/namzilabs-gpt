import { describe, expect, it } from "vitest";

import { shouldRenewSubscription } from "@/server/reconciliation/service";

describe("subscription renewal", () => {
  const now = new Date("2026-07-11T12:00:00Z");

  it("renews Google-style channels inside the 24-hour safety window", () => {
    expect(shouldRenewSubscription(new Date("2026-07-12T11:59:00Z"), now)).toBe(true);
  });

  it("does not churn healthy subscriptions", () => {
    expect(shouldRenewSubscription(new Date("2026-07-13T12:00:00Z"), now)).toBe(false);
    expect(shouldRenewSubscription(null, now)).toBe(false);
  });
});
