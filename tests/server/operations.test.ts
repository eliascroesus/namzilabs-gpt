import { describe, expect, it } from "vitest";

import { percentile, summarizeObjectives } from "@/server/operations/service";

describe("service objective measurements", () => {
  it("uses a nearest-rank p95 and does not claim success without samples", () => {
    expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100);
    expect(percentile([], 0.95)).toBeNull();
    const summary = summarizeObjectives([
      ...Array.from({ length: 19 }, () => ({ name: "webhook_acceptance_ms", value: 100 })),
      { name: "webhook_acceptance_ms", value: 900 },
    ]);
    expect(summary.webhook_acceptance_ms).toMatchObject({ samples: 20, p95: 100, passing: true });
    expect(summary.dashboard_query_ms).toMatchObject({ samples: 0, p95: null, passing: null });
  });

  it("reports a measured objective failure without converting it into an SLA claim", () => {
    const summary = summarizeObjectives([{ name: "webhook_to_dashboard_ms", value: 61_000 }]);
    expect(summary.webhook_to_dashboard_ms.passing).toBe(false);
  });
});
