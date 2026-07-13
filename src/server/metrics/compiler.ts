import { AppError } from "@/lib/errors";
import {
  type FilterNode,
  type MetricDefinition,
  metricDefinitionSchema,
} from "@/server/metrics/dsl";

type FieldKind = "string" | "number" | "boolean" | "timestamp" | "uuid";
type FieldSpec = { sql: string; kind: FieldKind; sensitive?: boolean };

export const datasetCatalog: Record<
  MetricDefinition["dataset"],
  { table: string; fields: Record<string, FieldSpec>; defaultTimeField?: string }
> = {
  activity_facts: {
    table: "activity_facts",
    defaultTimeField: "occurred_at",
    fields: {
      id: { sql: '"id"', kind: "uuid" },
      activity_type: { sql: '"activity_type"', kind: "string" },
      occurred_at: { sql: '"occurred_at"', kind: "timestamp" },
      connection_id: { sql: '"connection_id"', kind: "uuid" },
      entity_id: { sql: '"entity_id"', kind: "uuid" },
      person_id: { sql: '"person_id"', kind: "uuid" },
      company_id: { sql: '"company_id"', kind: "uuid" },
      lead_id: { sql: '"lead_id"', kind: "uuid" },
      campaign_id: { sql: '"campaign_id"', kind: "uuid" },
      opportunity_id: { sql: '"opportunity_id"', kind: "uuid" },
      status: { sql: '"activity_status"', kind: "string" },
      channel: { sql: '"channel"', kind: "string" },
      owner_id: { sql: '"owner_id"', kind: "string" },
      amount: { sql: '"amount"', kind: "number" },
      duration_seconds: { sql: '"duration_seconds"', kind: "number" },
      is_deleted: { sql: '"is_deleted"', kind: "boolean" },
      created_at: { sql: '"created_at"', kind: "timestamp" },
    },
  },
  source_records: {
    table: "source_records",
    defaultTimeField: "occurred_at",
    fields: {
      id: { sql: '"id"', kind: "uuid" },
      connection_id: { sql: '"connection_id"', kind: "uuid" },
      resource_type: { sql: '"resource_type"', kind: "string" },
      external_id: { sql: '"external_id"', kind: "string" },
      occurred_at: { sql: '"occurred_at"', kind: "timestamp" },
      source_updated_at: { sql: '"source_updated_at"', kind: "timestamp" },
      display_name: { sql: '"display_name"', kind: "string" },
      normalized_email: { sql: '"normalized_email"', kind: "string", sensitive: true },
      normalized_phone: { sql: '"normalized_phone"', kind: "string", sensitive: true },
      status: { sql: '"record_status"', kind: "string" },
      owner_external_id: { sql: '"owner_external_id"', kind: "string" },
      campaign_external_id: { sql: '"campaign_external_id"', kind: "string" },
      amount: { sql: '"amount"', kind: "number" },
      currency: { sql: '"currency"', kind: "string" },
      is_deleted: { sql: '"is_deleted"', kind: "boolean" },
      created_at: { sql: '"created_at"', kind: "timestamp" },
    },
  },
  canonical_entities: {
    table: "canonical_entities",
    defaultTimeField: "created_at",
    fields: {
      id: { sql: '"id"', kind: "uuid" },
      entity_type: { sql: '"entity_type"', kind: "string" },
      display_name: { sql: '"display_name"', kind: "string" },
      normalized_email: { sql: '"normalized_email"', kind: "string", sensitive: true },
      normalized_phone: { sql: '"normalized_phone"', kind: "string", sensitive: true },
      domain: { sql: '"domain"', kind: "string" },
      status: { sql: '"entity_status"', kind: "string" },
      owner_id: { sql: '"owner_id"', kind: "string" },
      locked: { sql: '"locked"', kind: "boolean" },
      created_at: { sql: '"created_at"', kind: "timestamp" },
      updated_at: { sql: '"updated_at"', kind: "timestamp" },
    },
  },
};

export type QueryWindow = { start: Date; end: Date; timezone: string };
export type CompiledMetric = {
  text: string;
  parameters: unknown[];
  matchingRecordsText: string;
  matchingRecordsParameters: unknown[];
};

class ParameterBag {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function fieldFor(
  definition: MetricDefinition,
  field: string,
  parameters: ParameterBag,
): FieldSpec {
  const specification = datasetCatalog[definition.dataset].fields[field];
  if (specification) return specification;
  if (definition.dataset === "source_records" && definition.source && field.startsWith("data.")) {
    const path = field.slice(5);
    if (!path || path.includes("\u0000")) {
      throw new AppError("metric_field_not_allowed", `Field '${field}' is not available.`, 400);
    }
    const raw = `("data" ->> ${parameters.add(path)})`;
    const inferred = definition.source.fieldTypes[field] ?? "string";
    if (inferred === "number") {
      return {
        sql: `(CASE WHEN ${raw} ~ '^-?[0-9]+([.][0-9]+)?$' THEN ${raw}::numeric ELSE NULL END)`,
        kind: "number",
      };
    }
    return { sql: raw, kind: "string" };
  }
  throw new AppError("metric_field_not_allowed", `Field '${field}' is not available.`, 400);
}

function validateValue(kind: FieldKind, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) validateValue(kind, item);
    return;
  }
  if (kind === "number" && typeof value !== "number") {
    throw new AppError("metric_value_type", "This filter requires a number.", 400);
  }
  if (kind === "boolean" && typeof value !== "boolean") {
    throw new AppError("metric_value_type", "This filter requires true or false.", 400);
  }
  if ((kind === "timestamp" || kind === "uuid" || kind === "string") && typeof value !== "string") {
    throw new AppError("metric_value_type", "This filter requires text.", 400);
  }
  if (kind === "timestamp" && Number.isNaN(Date.parse(String(value)))) {
    throw new AppError("metric_value_type", "This filter requires an ISO date.", 400);
  }
  if (
    kind === "uuid" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value),
    )
  ) {
    throw new AppError("metric_value_type", "This filter requires a UUID.", 400);
  }
}

function compileFilter(
  definition: MetricDefinition,
  node: FilterNode,
  parameters: ParameterBag,
): string {
  if ("conjunction" in node) {
    return `(${node.filters.map((child) => compileFilter(definition, child, parameters)).join(` ${node.conjunction.toUpperCase()} `)})`;
  }
  const field = fieldFor(definition, node.field, parameters);
  if (node.operator === "is_null") return `${field.sql} IS NULL`;
  if (node.operator === "is_not_null") return `${field.sql} IS NOT NULL`;
  if (node.operator === "is_empty") return `(${field.sql} IS NULL OR ${field.sql} = '')`;
  if (node.operator === "is_not_empty") return `(${field.sql} IS NOT NULL AND ${field.sql} <> '')`;
  if (node.value === undefined) {
    throw new AppError("metric_value_required", "This filter requires a value.", 400);
  }
  validateValue(field.kind, node.value);
  const operators = {
    equals: "=",
    not_equals: "<>",
    greater_than: ">",
    greater_than_or_equal: ">=",
    less_than: "<",
    less_than_or_equal: "<=",
  } as const;
  if (node.operator in operators) {
    return `${field.sql} ${operators[node.operator as keyof typeof operators]} ${parameters.add(node.value)}`;
  }
  if (node.operator === "in" || node.operator === "not_in") {
    if (!Array.isArray(node.value) || node.value.length === 0) {
      throw new AppError("metric_value_type", "This filter requires a non-empty list.", 400);
    }
    const placeholders = node.value.map((value) => parameters.add(value)).join(", ");
    return `${field.sql} ${node.operator === "not_in" ? "NOT IN" : "IN"} (${placeholders})`;
  }
  if (field.kind !== "string") {
    throw new AppError("metric_operator_type", "Text matching only works with text fields.", 400);
  }
  const escaped = String(node.value)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const value =
    node.operator === "contains" || node.operator === "not_contains"
      ? `%${escaped}%`
      : node.operator === "ends_with"
        ? `%${escaped}`
        : `${escaped}%`;
  if (node.operator === "not_contains") {
    return `${field.sql} NOT ILIKE ${parameters.add(value)} ESCAPE '\\'`;
  }
  return `${field.sql} ILIKE ${parameters.add(value)} ESCAPE '\\'`;
}

function compileFilters(
  definition: MetricDefinition,
  parameters: ParameterBag,
  filters = definition.filters,
): string[] {
  return filters.map((filter) => compileFilter(definition, filter, parameters));
}

function measureExpression(definition: MetricDefinition, parameters: ParameterBag): string {
  const measure = definition.measure;
  if (definition.funnelSteps) {
    return definition.funnelSteps
      .map((step, index) => {
        const filters = compileFilters(definition, parameters, step.filters);
        return `COUNT(*) FILTER (WHERE ${filters.join(" AND ")})::bigint AS "step_${index}"`;
      })
      .join(", ");
  }
  if (measure.operation === "count") return 'COUNT(*)::bigint AS "value"';
  if (measure.operation === "ratio") {
    throw new AppError(
      "metric_ratio_requires_service",
      "Saved metric ratios are evaluated by the metric service.",
      400,
    );
  }
  if (measure.operation === "percentage") {
    const numerator = compileFilters(definition, parameters, measure.numeratorFilters).join(
      " AND ",
    );
    const denominator =
      compileFilters(definition, parameters, measure.denominatorFilters).join(" AND ") || "TRUE";
    return `(COUNT(*) FILTER (WHERE ${numerator}))::numeric * 100 / NULLIF((COUNT(*) FILTER (WHERE ${denominator}))::numeric, 0) AS "value"`;
  }
  const field = fieldFor(definition, measure.field, parameters);
  if (
    ["sum", "average", "minimum", "maximum"].includes(measure.operation) &&
    field.kind !== "number"
  ) {
    throw new AppError("metric_measure_type", "This calculation requires a numeric field.", 400);
  }
  const functions = {
    distinct_count: "COUNT(DISTINCT",
    sum: "SUM(",
    average: "AVG(",
    minimum: "MIN(",
    maximum: "MAX(",
  } as const;
  return `${functions[measure.operation]}${field.sql}) AS "value"`;
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new AppError("invalid_timezone", "Select a valid IANA timezone.", 400);
  }
}

export function compileMetric(
  input: MetricDefinition,
  organizationId: string,
  window?: QueryWindow,
): CompiledMetric {
  const definition = metricDefinitionSchema.parse(input);
  const catalog = datasetCatalog[definition.dataset];
  const parameters = new ParameterBag();
  const where = [`"organization_id" = ${parameters.add(organizationId)}`];
  if (definition.source) {
    where.push(`"connection_id" = ${parameters.add(definition.source.connectionId)}`);
    where.push(`"resource_type" = ${parameters.add(definition.source.resourceType)}`);
  }
  where.push(...compileFilters(definition, parameters));
  if (window) {
    assertTimezone(window.timezone);
    if (!(window.start < window.end))
      throw new AppError("invalid_date_range", "The date range is invalid.", 400);
    const timeFieldName = definition.timeField ?? catalog.defaultTimeField;
    if (!timeFieldName)
      throw new AppError("metric_time_field_required", "Choose a time field.", 400);
    const timeField = fieldFor(definition, timeFieldName, parameters);
    if (timeField.kind !== "timestamp")
      throw new AppError("metric_time_field_type", "Choose a date field.", 400);
    where.push(`${timeField.sql} >= ${parameters.add(window.start.toISOString())}`);
    where.push(`${timeField.sql} < ${parameters.add(window.end.toISOString())}`);
  }
  if ("is_deleted" in catalog.fields) where.push('"is_deleted" = false');

  const selectParts: string[] = [];
  const groupParts: string[] = [];
  if (definition.timeGrain) {
    const timeField = fieldFor(definition, definition.timeField!, parameters);
    const timezone = parameters.add(window?.timezone ?? "UTC");
    const grain = definition.timeGrain;
    const expression = `DATE_TRUNC('${grain}', ${timeField.sql} AT TIME ZONE ${timezone})`;
    selectParts.push(`${expression} AS "time_bucket"`);
    groupParts.push(expression);
  }
  for (const group of definition.groupBy) {
    const field = fieldFor(definition, group, parameters);
    selectParts.push(`${field.sql} AS "${group}"`);
    groupParts.push(field.sql);
  }
  selectParts.push(measureExpression(definition, parameters));
  const groupBy = groupParts.length
    ? ` GROUP BY ${groupParts.join(", ")} ORDER BY ${groupParts.join(", ")}`
    : "";
  const text = `SELECT ${selectParts.join(", ")} FROM "${catalog.table}" WHERE ${where.join(" AND ")}${groupBy}`;
  const recordParameters = new ParameterBag();
  const recordWhere = [`"organization_id" = ${recordParameters.add(organizationId)}`];
  if (definition.source) {
    recordWhere.push(`"connection_id" = ${recordParameters.add(definition.source.connectionId)}`);
    recordWhere.push(`"resource_type" = ${recordParameters.add(definition.source.resourceType)}`);
  }
  recordWhere.push(...compileFilters(definition, recordParameters));
  if (window) {
    const timeField = fieldFor(
      definition,
      definition.timeField ?? catalog.defaultTimeField!,
      recordParameters,
    );
    recordWhere.push(`${timeField.sql} >= ${recordParameters.add(window.start.toISOString())}`);
    recordWhere.push(`${timeField.sql} < ${recordParameters.add(window.end.toISOString())}`);
  }
  if ("is_deleted" in catalog.fields) recordWhere.push('"is_deleted" = false');
  const publicColumns = Object.entries(catalog.fields)
    .filter(([, field]) => !field.sensitive)
    .map(([name, field]) => `${field.sql} AS "${name}"`)
    .join(", ");
  return {
    text,
    parameters: parameters.values,
    matchingRecordsText: `SELECT ${publicColumns} FROM "${catalog.table}" WHERE ${recordWhere.join(" AND ")} ORDER BY "${catalog.defaultTimeField ?? "created_at"}" DESC, "id" DESC LIMIT $${recordParameters.values.length + 1} OFFSET $${recordParameters.values.length + 2}`,
    matchingRecordsParameters: recordParameters.values,
  };
}

export function describeMetric(definition: MetricDefinition): {
  plainLanguage: string;
  formula: string;
} {
  const subject = definition.filters.find(
    (filter): filter is Extract<FilterNode, { field: string }> =>
      "field" in filter && filter.field === "activity_type",
  );
  const label =
    subject && typeof subject.value === "string"
      ? subject.value.replaceAll(".", " ")
      : definition.dataset.replaceAll("_", " ");
  const operation = definition.measure.operation.replaceAll("_", " ");
  const grouped = definition.groupBy.length ? `, grouped by ${definition.groupBy.join(", ")}` : "";
  return {
    plainLanguage: `${operation[0]!.toUpperCase()}${operation.slice(1)} of ${label}${grouped}.`,
    formula:
      definition.measure.operation === "percentage"
        ? "matching numerator records ÷ matching denominator records × 100"
        : `${operation}(${"field" in definition.measure ? definition.measure.field : "records"})`,
  };
}
