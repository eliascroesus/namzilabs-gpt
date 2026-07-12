export type GoalProgress = {
  current: number | null;
  target: number;
  gap: number | null;
  progressPercent: number | null;
  status: "on_track" | "off_track" | "complete" | "no_data";
};

export function calculateGoalProgress(input: {
  current: number | null;
  target: number;
  direction: "at_least" | "at_most";
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): GoalProgress {
  if (input.current === null || !Number.isFinite(input.current)) {
    return {
      current: null,
      target: input.target,
      gap: null,
      progressPercent: null,
      status: "no_data",
    };
  }
  const gap =
    input.direction === "at_least" ? input.target - input.current : input.current - input.target;
  const complete =
    input.direction === "at_least" ? input.current >= input.target : input.current <= input.target;
  const elapsed = Math.min(
    1,
    Math.max(
      0,
      (input.now.getTime() - input.periodStart.getTime()) /
        (input.periodEnd.getTime() - input.periodStart.getTime()),
    ),
  );
  const progressPercent = input.target === 0 ? null : (input.current / input.target) * 100;
  const expected = input.direction === "at_least" ? input.target * elapsed : input.target;
  const onTrack =
    input.direction === "at_least" ? input.current >= expected : input.current <= expected;
  return {
    current: input.current,
    target: input.target,
    gap: Math.max(0, gap),
    progressPercent,
    status: complete ? "complete" : onTrack ? "on_track" : "off_track",
  };
}
