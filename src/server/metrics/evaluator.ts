import type { FilterNode, MetricDefinition, MetricOperand } from "@/server/metrics/dsl";

export type FixtureRecord = Record<string, string | number | boolean | null | undefined>;

function compare(record: FixtureRecord, node: FilterNode): boolean {
  if ("conjunction" in node) {
    return node.conjunction === "and"
      ? node.filters.every((filter) => compare(record, filter))
      : node.filters.some((filter) => compare(record, filter));
  }
  const actual = record[node.field];
  if (node.operator === "is_null") return actual === null || actual === undefined;
  if (node.operator === "is_not_null") return actual !== null && actual !== undefined;
  if (node.operator === "equals") return actual === node.value;
  if (node.operator === "not_equals") return actual !== node.value;
  if (node.operator === "in")
    return Array.isArray(node.value) && node.value.includes(actual as never);
  if (node.operator === "not_in")
    return Array.isArray(node.value) && !node.value.includes(actual as never);
  if (node.operator === "contains")
    return String(actual ?? "")
      .toLowerCase()
      .includes(String(node.value).toLowerCase());
  if (node.operator === "starts_with")
    return String(actual ?? "")
      .toLowerCase()
      .startsWith(String(node.value).toLowerCase());
  if (node.operator === "greater_than") return Number(actual) > Number(node.value);
  if (node.operator === "greater_than_or_equal") return Number(actual) >= Number(node.value);
  if (node.operator === "less_than") return Number(actual) < Number(node.value);
  return Number(actual) <= Number(node.value);
}

function matching(records: FixtureRecord[], filters: FilterNode[]): FixtureRecord[] {
  return records.filter(
    (record) => filters.every((filter) => compare(record, filter)) && record.is_deleted !== true,
  );
}

export function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function evaluateOperand(records: FixtureRecord[], operand: MetricOperand): number | null {
  const selected = matching(records, operand.filters);
  if (operand.operation === "count") return selected.length;
  const values = selected
    .map((record) => record[operand.field!])
    .filter(
      (value): value is string | number | boolean =>
        value !== null && value !== undefined && value !== "",
    );
  if (operand.operation === "count_non_empty") return values.length;
  if (operand.operation === "distinct_count") return new Set(values).size;
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return operand.operation === "average" ? total / numbers.length : total;
}

export function evaluateFixture(
  definition: MetricDefinition,
  records: FixtureRecord[],
  window?: { start: Date; end: Date },
): number | null | number[] {
  const inWindow =
    window && definition.timeField
      ? records.filter((record) => {
          const timestamp = new Date(String(record[definition.timeField!]));
          return timestamp >= window.start && timestamp < window.end;
        })
      : records;
  const selected = matching(inWindow, definition.filters);
  if (definition.funnelSteps) {
    return definition.funnelSteps.map((step) => matching(selected, step.filters).length);
  }
  const measure = definition.measure;
  if (measure.operation === "count") return selected.length;
  if (measure.operation === "percentage") {
    if ("numerator" in measure) {
      const numerator = evaluateOperand(selected, measure.numerator);
      const denominator = evaluateOperand(selected, measure.denominator);
      if (numerator === null || denominator === null) return null;
      const ratio = safeDivide(numerator, denominator);
      return ratio === null ? null : ratio * 100;
    }
    const numerator = matching(selected, measure.numeratorFilters).length;
    const denominator = matching(selected, measure.denominatorFilters).length;
    const ratio = safeDivide(numerator, denominator);
    return ratio === null ? null : ratio * 100;
  }
  if (measure.operation === "ratio") return null;
  const values = selected
    .map((record) => record[measure.field])
    .filter(
      (value): value is string | number => typeof value === "string" || typeof value === "number",
    );
  if (measure.operation === "distinct_count") return new Set(values).size;
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return null;
  if (measure.operation === "sum") return numbers.reduce((total, value) => total + value, 0);
  if (measure.operation === "average")
    return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  if (measure.operation === "minimum") return Math.min(...numbers);
  return Math.max(...numbers);
}
