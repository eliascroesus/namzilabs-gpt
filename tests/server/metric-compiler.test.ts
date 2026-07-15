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

  it("compiles independently filtered numerator and denominator calculations", () => {
    const compiled = compileMetric(
      parseMetricDefinition({
        dataset: "activity_facts",
        measure: {
          operation: "percentage",
          numerator: {
            operation: "distinct_count",
            field: "person_id",
            filters: [{ field: "activity_type", operator: "equals", value: "meeting.booked" }],
          },
          denominator: {
            operation: "count_non_empty",
            field: "person_id",
            filters: [{ field: "activity_type", operator: "equals", value: "email.delivered" }],
          },
        },
      }),
      organizationId,
    );
    expect(compiled.text).toContain("COUNT(DISTINCT");
    expect(compiled.text).toContain("COUNT(NULLIF(BTRIM");
    expect(compiled.text).toContain("NULLIF");
    expect(compiled.parameters).toContain("meeting.booked");
    expect(compiled.parameters).toContain("email.delivered");
  });

  it("parses cross-source ratios with explicit percentage display semantics", () => {
    const definition = parseMetricDefinition({
      dataset: "source_records",
      measure: {
        operation: "ratio",
        numeratorMetricVersionId: "00000000-0000-4000-8000-000000000010",
        denominatorMetricVersionId: "00000000-0000-4000-8000-000000000011",
        asPercentage: true,
      },
    });
    expect(definition.measure).toMatchObject({ operation: "ratio", asPercentage: true });
  });

  it("normalizes legacy trend preferences to automatic KPI cards", () => {
    const definition = parseMetricDefinition({
      dataset: "source_records",
      measure: {
        operation: "ratio",
        numeratorMetricVersionId: "00000000-0000-4000-8000-000000000010",
        denominatorMetricVersionId: "00000000-0000-4000-8000-000000000011",
        asPercentage: true,
      },
      visualization: { display: "trend", color: "#8b5cf6" },
    });
    expect(definition.visualization.display).toBe("kpi");
  });

  it("keeps an optional KPI goal with the published metric definition", () => {
    const definition = parseMetricDefinition({
      dataset: "source_records",
      measure: { operation: "count" },
      goal: { target: 250 },
    });
    expect(definition.goal).toEqual({ target: 250 });
  });

  it("scopes spreadsheet metrics to one connection and tab while parameterizing column names", () => {
    const connectionId = "00000000-0000-4000-8000-000000000002";
    const resourceType = "google-sheet:sheet-id:123";
    const compiled = compileMetric(
      parseMetricDefinition({
        dataset: "source_records",
        source: {
          connectionId,
          provider: "google-sheets",
          resourceType,
          resourceId: "sheet-id:123",
          fieldTypes: { "data.Revenue": "number", "data.Status": "string" },
        },
        measure: { operation: "sum", field: "data.Revenue" },
        filters: [{ field: "data.Status", operator: "equals", value: "Won" }],
        timeField: "occurred_at",
      }),
      organizationId,
      window,
    );
    expect(compiled.text).toContain('"connection_id" = $2');
    expect(compiled.text).toContain('"resource_type" = $3');
    expect(compiled.parameters).toContain(connectionId);
    expect(compiled.parameters).toContain(resourceType);
    expect(compiled.parameters).toContain("Revenue");
    expect(compiled.parameters).toContain("Status");
    expect(compiled.text).not.toContain("Won");
  });
});
