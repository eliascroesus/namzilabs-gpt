import { AppError } from "@/lib/errors";

export type DatePreset = "last_7_days" | "last_30_days" | "this_month" | "this_quarter";

function partsAt(date: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
}

export function timezoneOffsetMilliseconds(date: Date, timezone: string): number {
  const parts = partsAt(date, timezone);
  return (
    Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) -
    date.getTime()
  );
}

export function zonedDateToUtc(
  values: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timezone: string,
): Date {
  const guess = new Date(
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour ?? 0,
      values.minute ?? 0,
      values.second ?? 0,
    ),
  );
  const first = new Date(guess.getTime() - timezoneOffsetMilliseconds(guess, timezone));
  const second = new Date(guess.getTime() - timezoneOffsetMilliseconds(first, timezone));
  return second;
}

export function dateRangeForPreset(
  preset: DatePreset,
  timezone: string,
  now = new Date(),
): { start: Date; end: Date } {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
  } catch {
    throw new AppError("invalid_timezone", "Select a valid IANA timezone.", 400);
  }
  const current = partsAt(now, timezone);
  const endDay = new Date(Date.UTC(current.year!, current.month! - 1, current.day! + 1));
  let startDay: Date;
  if (preset === "last_7_days" || preset === "last_30_days") {
    startDay = new Date(endDay.getTime() - (preset === "last_7_days" ? 7 : 30) * 86_400_000);
  } else if (preset === "this_month") {
    startDay = new Date(Date.UTC(current.year!, current.month! - 1, 1));
  } else {
    startDay = new Date(Date.UTC(current.year!, Math.floor((current.month! - 1) / 3) * 3, 1));
  }
  return {
    start: zonedDateToUtc(
      {
        year: startDay.getUTCFullYear(),
        month: startDay.getUTCMonth() + 1,
        day: startDay.getUTCDate(),
      },
      timezone,
    ),
    end: zonedDateToUtc(
      { year: endDay.getUTCFullYear(), month: endDay.getUTCMonth() + 1, day: endDay.getUTCDate() },
      timezone,
    ),
  };
}

export function previousWindow(window: { start: Date; end: Date }): { start: Date; end: Date } {
  const duration = window.end.getTime() - window.start.getTime();
  return { start: new Date(window.start.getTime() - duration), end: new Date(window.start) };
}
