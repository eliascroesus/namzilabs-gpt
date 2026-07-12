import { describe, expect, it } from "vitest";
import { calculateGoalProgress } from "@/server/goals/calculation";
import { dateRangeForPreset, zonedDateToUtc } from "@/server/metrics/time";

describe("timezone and daylight saving boundaries", () => {
  it("creates a 23-hour Stockholm day at the spring DST transition", () => {
    const start = zonedDateToUtc({ year: 2026, month: 3, day: 29 }, "Europe/Stockholm");
    const end = zonedDateToUtc({ year: 2026, month: 3, day: 30 }, "Europe/Stockholm");
    expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("uses local calendar boundaries for reporting presets", () => {
    const range = dateRangeForPreset(
      "this_month",
      "America/New_York",
      new Date("2026-07-11T12:00:00Z"),
    );
    expect(range.start.toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-12T04:00:00.000Z");
  });
});

describe("documented goal status", () => {
  it("compares progress with elapsed reporting time", () => {
    const progress = calculateGoalProgress({
      current: 47,
      target: 70,
      direction: "at_least",
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-08-01T00:00:00Z"),
      now: new Date("2026-07-25T00:00:00Z"),
    });
    expect(progress.status).toBe("off_track");
    expect(progress.gap).toBe(23);
  });
  it("does not invent status when data is missing", () => {
    expect(
      calculateGoalProgress({
        current: null,
        target: 10,
        direction: "at_least",
        periodStart: new Date(0),
        periodEnd: new Date(1000),
        now: new Date(500),
      }).status,
    ).toBe("no_data");
  });
});
