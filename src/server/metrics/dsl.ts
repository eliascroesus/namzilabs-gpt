import { z } from "zod";

export const canonicalEntityTypes = [
  "person",
  "company",
  "lead",
  "campaign",
  "booking",
  "opportunity",
  "message",
  "call",
  "workspace_user",
] as const;

export const canonicalActivityTypes = [
  "lead.created",
  "meeting.booked",
  "meeting.canceled",
  "meeting.rescheduled",
  "meeting.completed",
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.replied",
  "email.bounced",
  "sms.sent",
  "sms.delivered",
  "call.started",
  "call.completed",
  "opportunity.created",
  "opportunity.won",
  "opportunity.lost",
] as const;

export const datasetSchema = z.enum(["activity_facts", "source_records", "canonical_entities"]);
export const filterOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "starts_with",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "is_null",
  "is_not_null",
]);

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(80),
  operator: filterOperatorSchema,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())])
    .optional(),
});

export type FilterNode =
  z.infer<typeof filterConditionSchema> | { conjunction: "and" | "or"; filters: FilterNode[] };

export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    filterConditionSchema,
    z.object({
      conjunction: z.enum(["and", "or"]),
      filters: z.array(filterNodeSchema).min(1).max(20),
    }),
  ]),
);

const fieldMeasureSchema = z.object({
  operation: z.enum(["distinct_count", "sum", "average", "minimum", "maximum"]),
  field: z.string().min(1).max(80),
});

export const measureSchema = z.union([
  z.object({ operation: z.literal("count") }),
  fieldMeasureSchema,
  z.object({
    operation: z.literal("percentage"),
    numeratorFilters: z.array(filterNodeSchema).min(1).max(20),
    denominatorFilters: z.array(filterNodeSchema).max(20).default([]),
  }),
  z.object({
    operation: z.literal("ratio"),
    numeratorMetricVersionId: z.uuid(),
    denominatorMetricVersionId: z.uuid(),
  }),
]);

export const metricDefinitionSchema = z
  .object({
    dataset: datasetSchema,
    measure: measureSchema,
    filters: z.array(filterNodeSchema).max(20).default([]),
    timeField: z.string().min(1).max(80).optional(),
    groupBy: z.array(z.string().min(1).max(80)).max(3).default([]),
    timeGrain: z.enum(["hour", "day", "week", "month", "quarter"]).optional(),
    comparison: z.enum(["none", "previous_period"]).default("none"),
    funnelSteps: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          filters: z.array(filterNodeSchema).min(1).max(20),
        }),
      )
      .min(2)
      .max(10)
      .optional(),
  })
  .superRefine((definition, context) => {
    if (definition.timeGrain && !definition.timeField) {
      context.addIssue({ code: "custom", message: "A time field is required for time grouping." });
    }
    if (definition.funnelSteps && definition.measure.operation !== "count") {
      context.addIssue({ code: "custom", message: "Funnel steps use count as their measure." });
    }
  });

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export function parseMetricDefinition(input: unknown): MetricDefinition {
  return metricDefinitionSchema.parse(input);
}
