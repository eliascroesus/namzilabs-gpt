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
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "is_null",
  "is_not_null",
  "is_empty",
  "is_not_empty",
]);

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(240),
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
  field: z.string().min(1).max(240),
});

export const metricOperandSchema = z
  .object({
    operation: z.enum(["count", "count_non_empty", "distinct_count", "sum", "average"]),
    field: z.string().min(1).max(240).optional(),
    filters: z.array(filterNodeSchema).max(20).default([]),
  })
  .superRefine((operand, context) => {
    if (operand.operation !== "count" && !operand.field) {
      context.addIssue({
        code: "custom",
        message: "Choose a field for this side of the calculation.",
        path: ["field"],
      });
    }
  });

export type MetricOperand = z.infer<typeof metricOperandSchema>;

const metricSourceSchema = z.object({
  connectionId: z.uuid(),
  provider: z.string().min(1).max(80),
  resourceType: z.string().min(1).max(500),
  resourceId: z.string().min(1).max(500),
  spreadsheetId: z.string().max(200).optional(),
  spreadsheetName: z.string().max(200).optional(),
  sheetId: z.number().int().nonnegative().optional(),
  sheetName: z.string().max(200).optional(),
  fieldTypes: z
    .record(z.string(), z.enum(["null", "boolean", "number", "string", "date", "array", "object"]))
    .default({}),
});

export const measureSchema = z.union([
  z.object({ operation: z.literal("count") }),
  fieldMeasureSchema,
  z.object({
    operation: z.literal("percentage"),
    numerator: metricOperandSchema,
    denominator: metricOperandSchema,
  }),
  // Kept for previously published definitions. New metrics use explicit operands above.
  z.object({
    operation: z.literal("percentage"),
    numeratorFilters: z.array(filterNodeSchema).min(1).max(20),
    denominatorFilters: z.array(filterNodeSchema).max(20).default([]),
  }),
  z.object({
    operation: z.literal("ratio"),
    numeratorMetricVersionId: z.uuid(),
    denominatorMetricVersionId: z.uuid(),
    asPercentage: z.boolean().default(false),
  }),
]);

export const metricDefinitionSchema = z
  .object({
    dataset: datasetSchema,
    category: z.string().trim().min(1).max(80).default("Uncategorized"),
    source: metricSourceSchema.optional(),
    measure: measureSchema,
    filters: z.array(filterNodeSchema).max(20).default([]),
    timeField: z.string().min(1).max(80).optional(),
    groupBy: z.array(z.string().min(1).max(240)).max(3).default([]),
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
    visualization: z
      .object({
        display: z.enum(["kpi", "trend", "pie"]).default("kpi"),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#8b5cf6"),
      })
      .default({ display: "kpi", color: "#8b5cf6" }),
  })
  .superRefine((definition, context) => {
    if (definition.timeGrain && !definition.timeField) {
      context.addIssue({ code: "custom", message: "A time field is required for time grouping." });
    }
    if (definition.funnelSteps && definition.measure.operation !== "count") {
      context.addIssue({ code: "custom", message: "Funnel steps use count as their measure." });
    }
    if (
      definition.visualization.display === "trend" &&
      ["percentage", "ratio"].includes(definition.measure.operation)
    ) {
      context.addIssue({
        code: "custom",
        message: "Percentage and ratio metrics cannot be used as time-series graphs.",
        path: ["visualization", "display"],
      });
    }
  });

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export function parseMetricDefinition(input: unknown): MetricDefinition {
  return metricDefinitionSchema.parse(input);
}
