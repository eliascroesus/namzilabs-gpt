import { expect, it } from "vitest";
import { compileMetric } from "@/server/metrics/compiler";
import { parseMetricDefinition } from "@/server/metrics/dsl";

it("keeps deterministic compilation below the documented local target", () => {
  const definition = parseMetricDefinition({
    dataset: "activity_facts",
    measure: { operation: "count" },
    filters: [
      {
        conjunction: "and",
        filters: [
          {
            field: "activity_type",
            operator: "in",
            value: ["meeting.booked", "meeting.completed"],
          },
          { field: "channel", operator: "equals", value: "calendar" },
        ],
      },
    ],
    timeField: "occurred_at",
    groupBy: ["campaign_id"],
    timeGrain: "day",
  });
  const samples: number[] = [];
  for (let index = 0; index < 250; index += 1) {
    const start = performance.now();
    compileMetric(definition, "00000000-0000-4000-8000-000000000001", {
      start: new Date("2026-06-01T00:00:00Z"),
      end: new Date("2026-07-01T00:00:00Z"),
      timezone: "UTC",
    });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  expect(p95).toBeLessThan(5);
});
