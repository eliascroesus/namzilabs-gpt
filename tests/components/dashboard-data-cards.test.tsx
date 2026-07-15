import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardDataCards } from "@/components/dashboard-data-cards";

describe("DashboardDataCards", () => {
  it("keeps operational data visible in a compact summary", () => {
    const html = renderToStaticMarkup(
      <DashboardDataCards
        activeSources={3}
        connectedSources={4}
        unifiedRecords={1284}
        periodRecords={318}
        publishedMetrics={7}
        pipelineIssues={1}
        periodLabel="30-day"
      />,
    );

    expect(html).toContain("Active sources");
    expect(html).toContain("3");
    expect(html).toContain("4 connected");
    expect(html).toContain("Unified records");
    expect(html).toContain("1,284");
    expect(html).toContain("30-day records");
    expect(html).toContain("318");
    expect(html).toContain("Published metrics");
    expect(html).toContain("7");
    expect(html).toContain("Pipeline issues");
    expect(html).toContain("Needs attention");
  });

  it("shows a healthy pipeline label when there are no issues", () => {
    const html = renderToStaticMarkup(
      <DashboardDataCards
        activeSources={1}
        connectedSources={1}
        unifiedRecords={38}
        periodRecords={38}
        publishedMetrics={2}
        pipelineIssues={0}
        periodLabel="Today’s"
      />,
    );

    expect(html).toContain("Today’s records");
    expect(html).toContain("All systems clear");
  });
});
