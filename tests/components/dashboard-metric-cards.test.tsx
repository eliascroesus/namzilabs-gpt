import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DashboardMetricCards,
  type DashboardMetricCardData,
} from "@/components/dashboard-metric-cards";

const metrics: DashboardMetricCardData[] = [
  {
    id: "metric-one",
    versionId: "11111111-1111-4111-8111-111111111111",
    slug: "bookings",
    name: "Bookings",
    category: "Sales",
    sourceLabel: "Leads / Sheet1",
    value: 42,
    percentage: false,
    goal: 50,
    color: "#8b5cf6",
    points: Array.from({ length: 30 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      value: index + 1,
      estimated: false,
    })),
    hasTimeline: true,
    changePercent: 12.5,
    error: false,
  },
  {
    id: "metric-two",
    versionId: "22222222-2222-4222-8222-222222222222",
    slug: "booking-rate",
    name: "Booking rate",
    category: "Conversion",
    sourceLabel: "Combined metrics",
    value: 36.84,
    percentage: true,
    goal: null,
    color: "#34d399",
    points: [],
    hasTimeline: false,
    changePercent: null,
    error: false,
  },
];

describe("DashboardMetricCards", () => {
  it("renders published values and only gives timestamp metrics a timeline", () => {
    const html = renderToStaticMarkup(
      <DashboardMetricCards
        metrics={metrics}
        dashboard={null}
        range="last_30_days"
        timezone="Europe/Stockholm"
      />,
    );

    expect(html).toContain("Your live metrics");
    expect(html).toContain("Bookings");
    expect(html).toContain("42");
    expect(html).toContain("Booking rate");
    expect(html).toContain("36.84%");
    expect(html).toContain("Bookings timeline");
    expect(html).not.toContain("Booking rate timeline");
    expect(html).toContain("84% of 50 goal");
  });

  it("restores a saved large card as a 30-day dashboard view", () => {
    const html = renderToStaticMarkup(
      <DashboardMetricCards
        metrics={metrics}
        range="last_30_days"
        timezone="Europe/Stockholm"
        dashboard={{
          id: "dashboard-one",
          name: "Main dashboard",
          description: "Published metrics",
          timezone: "Europe/Stockholm",
          defaultDateRange: "last_30_days",
          cards: [
            {
              metricVersionId: metrics[0]!.versionId,
              cardType: "kpi",
              title: "Bookings",
              position: 0,
              configuration: { size: "large" },
            },
          ],
        }}
      />,
    );

    expect(html).toContain("dashboard-metric-card-large");
    expect(html).toContain("Last 30 days");
  });
});
