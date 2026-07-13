import { describe, expect, it } from "vitest";

import {
  dashboardMutationSchema,
  referencedMetricVersionIds,
} from "@/server/dashboards/validation";

const metricA = "00000000-0000-4000-8000-000000000011";
const metricB = "00000000-0000-4000-8000-000000000012";

describe("dashboard configuration validation", () => {
  it("accepts short reporting windows and finds every referenced metric", () => {
    const input = dashboardMutationSchema.parse({
      name: "Main dashboard",
      timezone: "Europe/Stockholm",
      defaultDateRange: "today",
      cards: [
        { metricVersionId: metricA, cardType: "kpi", title: "Bookings" },
        {
          metricVersionId: metricA,
          cardType: "breakdown",
          title: "Metric mix",
          configuration: { metricVersionIds: [metricA, metricB] },
        },
      ],
    });
    expect(referencedMetricVersionIds(input)).toEqual([metricA, metricB]);
  });

  it("rejects malformed pie metric references", () => {
    expect(() =>
      dashboardMutationSchema.parse({
        name: "Main dashboard",
        timezone: "UTC",
        cards: [
          {
            metricVersionId: metricA,
            cardType: "breakdown",
            title: "Metric mix",
            configuration: { metricVersionIds: ["not-an-id"] },
          },
        ],
      }),
    ).toThrow();
  });
});
