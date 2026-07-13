import { describe, expect, it } from "vitest";

import { parseMetricDefinition } from "@/server/metrics/dsl";
import { evaluateFixture, safeDivide } from "@/server/metrics/evaluator";

const records = [
  {
    id: "1",
    activity_type: "meeting.booked",
    person_id: "p1",
    amount: 100,
    occurred_at: "2026-06-02T10:00:00Z",
    is_deleted: false,
  },
  {
    id: "2",
    activity_type: "meeting.booked",
    person_id: "p1",
    amount: 150,
    occurred_at: "2026-06-03T10:00:00Z",
    is_deleted: false,
  },
  {
    id: "3",
    activity_type: "meeting.booked",
    person_id: "p2",
    amount: 50,
    occurred_at: "2026-05-03T10:00:00Z",
    is_deleted: false,
  },
  {
    id: "4",
    activity_type: "email.delivered",
    person_id: "p3",
    occurred_at: "2026-06-04T10:00:00Z",
    is_deleted: false,
  },
  {
    id: "5",
    activity_type: "email.replied",
    person_id: "p3",
    occurred_at: "2026-06-05T10:00:00Z",
    is_deleted: false,
  },
  {
    id: "6",
    activity_type: "meeting.booked",
    person_id: "p4",
    amount: 900,
    occurred_at: "2026-06-06T10:00:00Z",
    is_deleted: true,
  },
];
const june = { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-07-01T00:00:00Z") };

describe("hand-calculated fixture metrics", () => {
  it.each([
    ["count", undefined, 2],
    ["distinct_count", "person_id", 1],
    ["sum", "amount", 250],
    ["average", "amount", 125],
    ["minimum", "amount", 100],
    ["maximum", "amount", 150],
  ])("matches %s", (operation, field, expected) => {
    const definition = parseMetricDefinition({
      dataset: "activity_facts",
      measure: { operation, ...(field ? { field } : {}) },
      filters: [{ field: "activity_type", operator: "equals", value: "meeting.booked" }],
      timeField: "occurred_at",
    });
    expect(evaluateFixture(definition, records, june)).toBe(expected);
  });

  it("counts late-arriving data by occurred_at, not receipt time", () => {
    const late = {
      id: "late",
      activity_type: "meeting.booked",
      occurred_at: "2026-06-12T12:00:00Z",
      received_at: "2026-07-08T12:00:00Z",
      is_deleted: false,
    };
    const definition = parseMetricDefinition({
      dataset: "activity_facts",
      measure: { operation: "count" },
      filters: [{ field: "activity_type", operator: "equals", value: "meeting.booked" }],
      timeField: "occurred_at",
    });
    expect(evaluateFixture(definition, [...records, late], june)).toBe(3);
  });

  it("evaluates a filtered calculation divided by a different filtered calculation", () => {
    const definition = parseMetricDefinition({
      dataset: "activity_facts",
      measure: {
        operation: "percentage",
        numerator: {
          operation: "count",
          filters: [{ field: "activity_type", operator: "equals", value: "meeting.booked" }],
        },
        denominator: {
          operation: "count_non_empty",
          field: "person_id",
          filters: [],
        },
      },
    });
    expect(evaluateFixture(definition, records)).toBe(60);
  });

  it("returns null for division by zero and missing numeric data", () => {
    expect(safeDivide(5, 0)).toBeNull();
    const definition = parseMetricDefinition({
      dataset: "activity_facts",
      measure: { operation: "sum", field: "amount" },
      filters: [{ field: "activity_type", operator: "equals", value: "email.replied" }],
    });
    expect(evaluateFixture(definition, records)).toBeNull();
  });
});
