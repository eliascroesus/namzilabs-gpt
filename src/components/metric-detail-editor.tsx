"use client";

import { Check, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { FilterNode, MetricDefinition, MetricOperand } from "@/server/metrics/dsl";

export type MetricComponentOption = {
  metricId: string;
  versionId: string;
  name: string;
  description: string;
  sourceLabel: string;
};

type EditableFilter = {
  id: string;
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value: string;
};
type EditableOperand = Omit<MetricOperand, "filters"> & { filters: EditableFilter[] };

const operators: { value: EditableFilter["operator"]; label: string }[] = [
  { value: "equals", label: "Exactly matches" },
  { value: "not_equals", label: "Does not match" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

function simpleFilters(filters: FilterNode[]): EditableFilter[] {
  return filters.flatMap((filter) => {
    if ("conjunction" in filter) return [];
    if (!operators.some((operator) => operator.value === filter.operator)) return [];
    return [
      {
        id: crypto.randomUUID(),
        field: filter.field,
        operator: filter.operator as EditableFilter["operator"],
        value: filter.value === undefined ? "" : String(filter.value),
      },
    ];
  });
}

function displayField(field: string): string {
  return field.startsWith("data.") ? field.slice(5) : field;
}

function initialPercentageOperands(
  measure: Extract<MetricDefinition["measure"], { operation: "percentage" }>,
): { numerator: EditableOperand; denominator: EditableOperand } {
  if ("numerator" in measure) {
    return {
      numerator: { ...measure.numerator, filters: simpleFilters(measure.numerator.filters) },
      denominator: { ...measure.denominator, filters: simpleFilters(measure.denominator.filters) },
    };
  }
  return {
    numerator: { operation: "count", filters: simpleFilters(measure.numeratorFilters) },
    denominator: { operation: "count", filters: simpleFilters(measure.denominatorFilters) },
  };
}

function FilterEditor({
  title,
  rows,
  fields,
  onChange,
}: {
  title: string;
  rows: EditableFilter[];
  fields: string[];
  onChange: (rows: EditableFilter[]) => void;
}) {
  function update(id: string, patch: Partial<EditableFilter>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  return (
    <section className="ratio-side-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {rows.length ? `${rows.length} AND rule(s)` : "All rows"}
          </p>
        </div>
        <button
          type="button"
          className="secondary-link"
          onClick={() =>
            onChange([
              ...rows,
              {
                id: crypto.randomUUID(),
                field: fields[0] ?? "",
                operator: "equals",
                value: "",
              },
            ])
          }
        >
          <Plus size={14} /> Add rule
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div className="ratio-rule" key={row.id}>
              <select
                className="field-control"
                value={row.field}
                onChange={(event) => update(row.id, { field: event.target.value })}
              >
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {displayField(field)}
                  </option>
                ))}
              </select>
              <select
                className="field-control"
                value={row.operator}
                onChange={(event) =>
                  update(row.id, { operator: event.target.value as EditableFilter["operator"] })
                }
              >
                {operators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <input
                className="field-control"
                value={row.value}
                disabled={["is_empty", "is_not_empty"].includes(row.operator)}
                onChange={(event) => update(row.id, { value: event.target.value })}
                placeholder="Value"
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${title} rule`}
                onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--line)] px-4 py-6 text-center text-xs text-[var(--muted)]">
            No rules — this side uses every source row.
          </div>
        )}
      </div>
    </section>
  );
}

function OperandEditor({
  label,
  operand,
  fields,
  numericFields,
  onChange,
}: {
  label: string;
  operand: EditableOperand;
  fields: string[];
  numericFields: string[];
  onChange: (operand: EditableOperand) => void;
}) {
  const needsField = operand.operation !== "count";
  const availableFields = ["sum", "average"].includes(operand.operation) ? numericFields : fields;
  return (
    <section className="ratio-side-card">
      <div className="flex items-center gap-3">
        <span className="ratio-side-badge">{label === "Numerator" ? "A" : "B"}</span>
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {label === "Numerator" ? "What happened" : "What it is compared against"}
          </p>
        </div>
      </div>
      <label className="mt-4 block">
        <span className="field-label">Calculation</span>
        <select
          className="field-control mt-2 w-full"
          value={operand.operation}
          onChange={(event) => {
            const operation = event.target.value as EditableOperand["operation"];
            const candidates = ["sum", "average"].includes(operation) ? numericFields : fields;
            onChange({ ...operand, operation, field: operand.field || candidates[0] });
          }}
        >
          <option value="count">Count rows</option>
          <option value="count_non_empty">Count non-empty values</option>
          <option value="distinct_count">Count unique values</option>
          <option value="sum">Sum a number column</option>
          <option value="average">Average a number column</option>
        </select>
      </label>
      {needsField ? (
        <label className="mt-3 block">
          <span className="field-label">Column</span>
          <select
            className="field-control mt-2 w-full"
            value={operand.field ?? ""}
            onChange={(event) => onChange({ ...operand, field: event.target.value })}
          >
            {availableFields.map((field) => (
              <option key={field} value={field}>
                {displayField(field)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}

export function MetricDetailEditor({
  metric,
  version,
  resourceConfiguration,
  components,
  currentValue,
}: {
  metric: { id: string; name: string; description: string; slug: string };
  version: {
    version: number;
    status: string;
    definition: MetricDefinition;
    plainLanguage: string;
    formula: string;
    definitionHash: string;
  };
  resourceConfiguration: Record<string, unknown> | null;
  components: MetricComponentOption[];
  currentValue: number | null;
}) {
  const router = useRouter();
  const definition = version.definition;
  const source = definition.source;
  const originalMeasure = definition.measure;
  const originalOperation = originalMeasure.operation;
  const percentageOperands =
    originalOperation === "percentage" ? initialPercentageOperands(originalMeasure) : null;
  const [name, setName] = useState(metric.name);
  const [description, setDescription] = useState(metric.description);
  const [category, setCategory] = useState(definition.category);
  const [operation, setOperation] = useState(originalOperation);
  const [field, setField] = useState(
    "field" in originalMeasure
      ? originalMeasure.field
      : (Object.keys(source?.fieldTypes ?? {})[0] ?? ""),
  );
  const [numeratorOperand, setNumeratorOperand] = useState<EditableOperand>(
    percentageOperands?.numerator ?? { operation: "count", filters: [] },
  );
  const [denominatorOperand, setDenominatorOperand] = useState<EditableOperand>(
    percentageOperands?.denominator ?? { operation: "count", filters: [] },
  );
  const [numeratorVersionId, setNumeratorVersionId] = useState(
    originalOperation === "ratio" ? originalMeasure.numeratorMetricVersionId : "",
  );
  const [denominatorVersionId, setDenominatorVersionId] = useState(
    originalOperation === "ratio" ? originalMeasure.denominatorMetricVersionId : "",
  );
  const [filters, setFilters] = useState(() => simpleFilters(definition.filters));
  const [visualizationColor, setVisualizationColor] = useState(
    ["#ff7417", "#f5741c"].includes(definition.visualization.color.toLowerCase())
      ? "#8b5cf6"
      : definition.visualization.color,
  );
  const [goalTarget, setGoalTarget] = useState(
    definition.goal ? String(definition.goal.target) : "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo(() => Object.keys(source?.fieldTypes ?? {}), [source?.fieldTypes]);
  const numericFields = useMemo(
    () => fields.filter((item) => source?.fieldTypes[item] === "number"),
    [fields, source?.fieldTypes],
  );
  const isRatio = operation === "ratio";
  const isPercentage = operation === "percentage" || operation === "ratio";

  function typedValue(fieldName: string, value: string): string | number {
    return source?.fieldTypes[fieldName] === "number" ? Number(value) : value;
  }

  function definitionFilters(rows: EditableFilter[]): FilterNode[] {
    return rows.map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      ...(!["is_empty", "is_not_empty"].includes(filter.operator)
        ? { value: typedValue(filter.field, filter.value) }
        : {}),
    }));
  }

  function buildOperand(operand: EditableOperand): MetricOperand {
    return {
      operation: operand.operation,
      ...(operand.operation !== "count" ? { field: operand.field } : {}),
      filters: definitionFilters(operand.filters),
    };
  }

  function buildDefinition(): MetricDefinition {
    let measure: MetricDefinition["measure"];
    if (operation === "count") measure = { operation: "count" };
    else if (operation === "percentage") {
      measure = {
        operation: "percentage",
        numerator: buildOperand(numeratorOperand),
        denominator: buildOperand(denominatorOperand),
      };
    } else if (operation === "ratio") {
      measure = {
        operation: "ratio",
        numeratorMetricVersionId: numeratorVersionId,
        denominatorMetricVersionId: denominatorVersionId,
        asPercentage: true,
      };
    } else measure = { operation, field };
    return {
      ...definition,
      category: category.trim() || "Uncategorized",
      ...(goalTarget.trim() ? { goal: { target: Number(goalTarget) } } : { goal: undefined }),
      measure,
      filters: isRatio ? [] : definitionFilters(filters),
      visualization: { display: "kpi", color: visualizationColor },
    };
  }

  async function saveMetric() {
    if (!name.trim()) return;
    if (goalTarget.trim() && (!Number.isFinite(Number(goalTarget)) || Number(goalTarget) < 0)) {
      setError("Enter a valid KPI goal of zero or more.");
      return;
    }
    if (isRatio && (!numeratorVersionId || !denominatorVersionId)) {
      setError("Choose both component metrics.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const metadataResponse = await fetch(`/api/metrics/${metric.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!metadataResponse.ok) {
        const result = (await metadataResponse.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message ?? "Metric details could not be saved.");
      }
      const draftResponse = await fetch(`/api/metrics/${metric.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: buildDefinition() }),
      });
      const draft = (await draftResponse.json()) as {
        data?: { version: number };
        error?: { message?: string };
      };
      if (!draftResponse.ok || !draft.data) {
        throw new Error(draft.error?.message ?? "A new metric version could not be created.");
      }
      const publishResponse = await fetch(
        `/api/metrics/${metric.id}/versions/${draft.data.version}/publish`,
        { method: "POST" },
      );
      if (!publishResponse.ok) {
        const result = (await publishResponse.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message ?? "The new metric version could not be published.");
      }
      setMessage(`Version ${draft.data.version} saved and published.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The metric could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMetric() {
    if (!window.confirm(`Delete “${metric.name}” and its history? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/metrics/${metric.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? "The metric could not be deleted.");
      router.push("/metrics");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The metric could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="shell-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Live result
              </p>
              <p className="mt-2 text-4xl font-semibold">
                {currentValue === null
                  ? "—"
                  : `${currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}${isPercentage ? "%" : ""}`}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">Current 30-day window</p>
              {definition.goal && currentValue !== null ? (
                <p className="mt-2 text-xs font-medium text-[var(--accent)]">
                  {definition.goal.target === 0
                    ? `Goal ${definition.goal.target.toLocaleString()}${isPercentage ? "%" : ""}`
                    : `${((currentValue / definition.goal.target) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}% of ${definition.goal.target.toLocaleString()}${isPercentage ? "%" : ""} goal`}
                </p>
              ) : null}
            </div>
            <span className="status-pill">Version {version.version} published</span>
          </div>
        </section>

        <section className="shell-card p-5">
          <h2 className="text-base font-semibold">Edit metric</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Saving creates and publishes a traceable new version.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="field-label">Metric name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="field-control mt-2 w-full"
              />
            </label>
            <label>
              <span className="field-label">Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="field-control mt-2 w-full"
              />
            </label>
            <label>
              <span className="field-label">Category</span>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="field-control mt-2 w-full"
                placeholder="Sales, Acquisition…"
                maxLength={80}
              />
            </label>
            <label>
              <span className="field-label">KPI goal (optional)</span>
              <input
                type="number"
                min="0"
                step="any"
                value={goalTarget}
                onChange={(event) => setGoalTarget(event.target.value)}
                className="field-control mt-2 w-full"
                placeholder={isPercentage ? "e.g. 35%" : "e.g. 500"}
              />
            </label>
          </div>
          <label className="mt-5 block">
            <span className="field-label">Calculation</span>
            <select
              value={operation}
              onChange={(event) => {
                const next = event.target.value as typeof operation;
                setOperation(next);
              }}
              className="field-control mt-2 w-full"
            >
              <option value="count">Count records</option>
              <option value="distinct_count">Count unique</option>
              <option value="sum">Sum</option>
              <option value="average">Average</option>
              <option value="minimum">Minimum</option>
              <option value="maximum">Maximum</option>
              <option value="percentage">Percentage / ratio within this source</option>
              {components.length >= 2 ? (
                <option value="ratio">Percentage across metrics</option>
              ) : null}
            </select>
          </label>

          {isRatio ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Numerator metric", numeratorVersionId, setNumeratorVersionId],
                ["Denominator metric", denominatorVersionId, setDenominatorVersionId],
              ].map(([label, value, setter]) => (
                <label key={String(label)}>
                  <span className="field-label">{String(label)}</span>
                  <select
                    value={String(value)}
                    onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                    className="field-control mt-2 w-full"
                  >
                    <option value="">Choose metric</option>
                    {components.map((component) => (
                      <option key={component.versionId} value={component.versionId}>
                        {component.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : operation === "percentage" ? (
            <>
              <div className="ratio-formula-banner mt-5">
                <span>A</span>
                <strong>÷</strong>
                <span>B</span>
                <strong>× 100</strong>
                <p>Two independent calculations with independent rule sets.</p>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <OperandEditor
                  label="Numerator"
                  operand={numeratorOperand}
                  fields={fields}
                  numericFields={numericFields}
                  onChange={setNumeratorOperand}
                />
                <OperandEditor
                  label="Denominator"
                  operand={denominatorOperand}
                  fields={fields}
                  numericFields={numericFields}
                  onChange={setDenominatorOperand}
                />
              </div>
            </>
          ) : operation !== "count" ? (
            <label className="mt-5 block">
              <span className="field-label">Field</span>
              <select
                value={field}
                onChange={(event) => setField(event.target.value)}
                className="field-control mt-2 w-full"
              >
                {fields
                  .filter((item) =>
                    ["sum", "average", "minimum", "maximum"].includes(operation)
                      ? numericFields.includes(item)
                      : true,
                  )
                  .map((item) => (
                    <option key={item} value={item}>
                      {displayField(item)}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </section>

        {!isRatio ? (
          operation === "percentage" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <FilterEditor
                title="Numerator rules"
                rows={numeratorOperand.filters}
                fields={fields}
                onChange={(rows) =>
                  setNumeratorOperand((current) => ({ ...current, filters: rows }))
                }
              />
              <FilterEditor
                title="Denominator rules"
                rows={denominatorOperand.filters}
                fields={fields}
                onChange={(rows) =>
                  setDenominatorOperand((current) => ({ ...current, filters: rows }))
                }
              />
            </div>
          ) : (
            <FilterEditor
              title="Shared rules"
              rows={filters}
              fields={fields}
              onChange={setFilters}
            />
          )
        ) : null}

        <section className="shell-card p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Dashboard card</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Every metric is a KPI card. A chart appears automatically when a record-date column
                is configured.
              </p>
            </div>
            <input
              type="color"
              value={visualizationColor}
              onChange={(event) => setVisualizationColor(event.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-[var(--line)] bg-transparent"
              aria-label="Visualization color"
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveMetric()}
            disabled={saving || deleting}
            className="primary-link"
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "Save new version"}
          </button>
          <button
            type="button"
            onClick={() => void deleteMetric()}
            disabled={saving || deleting}
            className="danger-link"
          >
            {deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {deleting ? "Deleting…" : "Delete metric"}
          </button>
          {message ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
              <Check size={13} /> {message}
            </span>
          ) : null}
          {error ? <span className="text-xs text-rose-300">{error}</span> : null}
        </div>
      </div>

      <aside className="space-y-5">
        <section className="shell-card p-5">
          <h2 className="text-sm font-semibold">Source provenance</h2>
          <dl className="mt-4 space-y-3 text-xs">
            {[
              ["Provider", source?.provider ?? "Combined metrics"],
              ["Spreadsheet", source?.spreadsheetName ?? "—"],
              ["Worksheet", source?.sheetName ?? "—"],
              ["Unique row ID", String(resourceConfiguration?.uniqueKeyColumn ?? "—")],
              [
                "Timeline",
                resourceConfiguration?.timestampColumn
                  ? `Enabled · ${String(resourceConfiguration.timestampColumn)}`
                  : "Not configured",
              ],
              [
                "KPI goal",
                definition.goal
                  ? `${definition.goal.target.toLocaleString()}${isPercentage ? "%" : ""}`
                  : "Not set",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
              >
                <dt className="text-[var(--muted)]">{label}</dt>
                <dd className="mt-1 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {source?.connectionId ? (
            <Link
              href={`/metrics/new?connection=${source.connectionId}`}
              className="text-button mt-5"
            >
              Build another metric from this source
            </Link>
          ) : null}
        </section>
        <section className="shell-card p-5">
          <h2 className="text-sm font-semibold">Published definition</h2>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{version.plainLanguage}</p>
          <code className="mt-3 block rounded-lg bg-[var(--surface-2)] p-3 text-xs">
            {version.formula}
          </code>
          <details className="mt-4 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer font-semibold">Inspect raw definition</summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--surface-2)] p-3 text-[10px] leading-5">
              {JSON.stringify(definition, null, 2)}
            </pre>
          </details>
        </section>
      </aside>
    </div>
  );
}
