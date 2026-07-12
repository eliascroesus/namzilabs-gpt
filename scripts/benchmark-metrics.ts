import { compileMetric } from "../src/server/metrics/compiler";
import { parseMetricDefinition } from "../src/server/metrics/dsl";

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
  timeGrain: "day",
  groupBy: ["campaign_id"],
});

const samples: number[] = [];
for (let index = 0; index < 10_000; index += 1) {
  const startedAt = performance.now();
  compileMetric(definition, "00000000-0000-4000-8000-000000000001", {
    start: new Date("2026-06-01T00:00:00Z"),
    end: new Date("2026-07-01T00:00:00Z"),
    timezone: "Europe/Stockholm",
  });
  samples.push(performance.now() - startedAt);
}
samples.sort((left, right) => left - right);
const percentile = (value: number) => samples[Math.floor(samples.length * value)]!;

console.log(
  JSON.stringify(
    {
      iterations: samples.length,
      unit: "milliseconds",
      p50: Number(percentile(0.5).toFixed(4)),
      p95: Number(percentile(0.95).toFixed(4)),
      p99: Number(percentile(0.99).toFixed(4)),
      targetP95: 5,
    },
    null,
    2,
  ),
);
