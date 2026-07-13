import { z } from "zod";

export const dashboardCardInputSchema = z
  .object({
    metricVersionId: z.uuid(),
    cardType: z.enum(["kpi", "time_series", "funnel", "breakdown", "goal"]),
    title: z.string().trim().min(1).max(100),
    configuration: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((card, context) => {
    const configured = card.configuration.metricVersionIds;
    if (configured === undefined) return;
    if (!Array.isArray(configured) || configured.some((id) => !z.uuid().safeParse(id).success)) {
      context.addIssue({
        code: "custom",
        path: ["configuration", "metricVersionIds"],
        message: "Pie chart metric references must be valid IDs.",
      });
    }
  });

export const dashboardMutationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(""),
  timezone: z.string().min(1).max(100),
  defaultDateRange: z
    .enum(["today", "yesterday", "last_7_days", "last_30_days", "this_month", "this_quarter"])
    .default("last_30_days"),
  cards: z.array(dashboardCardInputSchema).max(40).default([]),
});

export type DashboardMutation = z.infer<typeof dashboardMutationSchema>;

export function referencedMetricVersionIds(input: DashboardMutation): string[] {
  const ids = new Set(input.cards.map((card) => card.metricVersionId));
  for (const card of input.cards) {
    const configured = card.configuration.metricVersionIds;
    if (!Array.isArray(configured)) continue;
    for (const id of configured) {
      if (typeof id === "string" && z.uuid().safeParse(id).success) ids.add(id);
    }
  }
  return [...ids];
}
