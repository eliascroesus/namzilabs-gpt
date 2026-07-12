import { describe, expect, it } from "vitest";

import { compileMetric } from "@/server/metrics/compiler";
import { parseMetricDefinition } from "@/server/metrics/dsl";

const organizationId = "00000000-0000-4000-8000-000000000001";
const window = {
  start: new Date("2026-06-01T00:00:00Z"),
  end: new Date("2026-07-01T00:00:00Z"),
  timezone: "Europe/Stockholm",
};

describe("metric SQL compiler", () => {
  it("compiles allowlisted fields and customer values as parameters", () => {
    const attack = "meeting.booked' OR TRUE; --";
    const compiled = compileMetric(
      parseMetricDefinition({
        dataset: "activity_facts",
        measure: { operation: "count" },
        filters: [{ field: "activity_type", operator: "equals", value: attack }],
        timeField: "occurred_at",
        groupBy: ["campaign_id"],
      }),
      organizationId,
      window,
    );
    expect(compiled.text).toContain('FROM "activity_facts"');
    expect(compiled.text).toContain('"activity_type" = $2');
    expect(compiled.text).not.toContain(attack);
    expect(compiled.parameters).toContain(attack);
    expect(compiled.text).toContain('"organization_id" = $1');
  });

  it("rejects customer-controlled identifiers and wrong value types", () => {
    expect(() =>
      compileMetric(
        parseMetricDefinition({
          dataset: "activity_facts",
          measure: { operation: "count" },
          filters: [
            { field: "activity_type; DROP TABLE raw_events", operator: "equals", value: "x" },
          ],
        }),
        organizationId,
      ),
    ).toThrow("not available");
    expect(() =>
      compileMetric(
        parseMetricDefinition({
          dataset: "activity_facts",
          measure: { operation: "count" },
          filters: [{ field: "amount", operator: "greater_than", value: "100" }],
        }),
        organizationId,
      ),
    ).toThrow("requires a number");
  });

  it("uses NULLIF for explicit division-by-zero semantics", () => {
    const compiled = compileMetric(
      parseMetricDefinition({
        dataset: "activity_facts",
        measure: {
          operation: "percentage",
          numeratorFilters: [
            { field: "activity_type", operator: "equals", value: "email.replied" },
          ],
          denominatorFilters: [
            { field: "activity_type", operator: "equals", value: "email.delivered" },
          ],
        },
      }),
      organizationId,
    );
    expect(compiled.text).toContain("NULLIF");
  });
});
