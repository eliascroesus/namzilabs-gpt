"use client";

import { Check, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { FilterNode, MetricDefinition } from "@/server/metrics/dsl";

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
  const initialPercentageFilter =
    originalOperation === "percentage" && "field" in originalMeasure.numeratorFilters[0]!
      ? originalMeasure.numeratorFilters[0]
      : null;
  const [name, setName] = useState(metric.name);
  const [description, setDescription] = useState(metric.description);
  const [operation, setOperation] = useState(originalOperation);
  const [field, setField] = useState(
    "field" in originalMeasure
      ? originalMeasure.field
      : initialPercentageFilter && "field" in initialPercentageFilter
        ? initialPercentageFilter.field
        : (Object.keys(source?.fieldTypes ?? {})[0] ?? ""),
  );
  const [percentageValue, setPercentageValue] = useState(
    initialPercentageFilter && "value" in initialPercentageFilter
      ? String(initialPercentageFilter.value ?? "")
      : "",
  );
  const [numeratorVersionId, setNumeratorVersionId] = useState(
    originalOperation === "ratio" ? originalMeasure.numeratorMetricVersionId : "",
  );
  const [denominatorVersionId, setDenominatorVersionId] = useState(
    originalOperation === "ratio" ? originalMeasure.denominatorMetricVersionId : "",
  );
  const [filters, setFilters] = useState(() => simpleFilters(definition.filters));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo(() => Object.keys(source?.fieldTypes ?? {}), [source?.fieldTypes]);
  const isRatio = operation === "ratio";
  const isPercentage = operation === "percentage" || operation === "ratio";

  function typedValue(fieldName: string, value: string): string | number {
    return source?.fieldTypes[fieldName] === "number" ? Number(value) : value;
  }

  function buildDefinition(): MetricDefinition {
    let measure: MetricDefinition["measure"];
    if (operation === "count") {
      measure = { operation: "count" };
    } else if (operation === "percentage") {
      measure = {
        operation: "percentage",
        numeratorFilters: [
          { field, operator: "equals", value: typedValue(field, percentageValue) },
        ],
        denominatorFilters: [],
      };
    } else if (operation === "ratio") {
      measure = {
        operation: "ratio",
        numeratorMetricVersionId: numeratorVersionId,
        denominatorMetricVersionId: denominatorVersionId,
        asPercentage: true,
      };
    } else {
      measure = { operation, field };
    }
    return {
      ...definition,
      measure,
      filters: isRatio
        ? []
        : filters.map((filter) => ({
            field: filter.field,
            operator: filter.operator,
            ...(!["is_empty", "is_not_empty"].includes(filter.operator)
              ? { value: typedValue(filter.field, filter.value) }
              : {}),
          })),
    };
  }

  async function saveMetric() {
    if (!name.trim()) return;
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
          </div>

          <label className="mt-5 block">
            <span className="field-label">Calculation</span>
            <select
              value={operation}
              onChange={(event) => setOperation(event.target.value as typeof operation)}
              className="field-control mt-2 w-full"
            >
              <option value="count">Count records</option>
              <option value="distinct_count">Count unique</option>
              <option value="sum">Sum</option>
              <option value="average">Average</option>
              <option value="percentage">Percentage within this source</option>
              {components.length >= 2 ? (
                <option value="ratio">Percentage across metrics</option>
              ) : null}
            </select>
          </label>

          {isRatio ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">Numerator metric</span>
                <select
                  value={numeratorVersionId}
                  onChange={(event) => setNumeratorVersionId(event.target.value)}
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
              <label>
                <span className="field-label">Denominator metric</span>
                <select
                  value={denominatorVersionId}
                  onChange={(event) => setDenominatorVersionId(event.target.value)}
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
            </div>
          ) : operation !== "count" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">
                  {operation === "percentage" ? "Success field" : "Field"}
                </span>
                <select
                  value={field}
                  onChange={(event) => setField(event.target.value)}
                  className="field-control mt-2 w-full"
                >
                  {fields.map((item) => (
                    <option key={item} value={item}>
                      {displayField(item)}
                    </option>
                  ))}
                </select>
              </label>
              {operation === "percentage" ? (
                <label>
                  <span className="field-label">Success value</span>
                  <input
                    value={percentageValue}
                    onChange={(event) => setPercentageValue(event.target.value)}
                    className="field-control mt-2 w-full"
                    placeholder="e.g. Yes"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </section>

        {!isRatio ? (
          <section className="shell-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Rules</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">All rules use AND logic.</p>
              </div>
              <button
                type="button"
                className="secondary-link"
                onClick={() =>
                  setFilters((current) => [
                    ...current,
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
            <div className="mt-5 space-y-3">
              {filters.length ? (
                filters.map((filter) => (
                  <div key={filter.id} className="filter-row">
                    <select
                      value={filter.field}
                      onChange={(event) =>
                        setFilters((current) =>
                          current.map((item) =>
                            item.id === filter.id ? { ...item, field: event.target.value } : item,
                          ),
                        )
                      }
                      className="field-control"
                    >
                      {fields.map((item) => (
                        <option key={item} value={item}>
                          {displayField(item)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(event) =>
                        setFilters((current) =>
                          current.map((item) =>
                            item.id === filter.id
                              ? {
                                  ...item,
                                  operator: event.target.value as EditableFilter["operator"],
                                }
                              : item,
                          ),
                        )
                      }
                      className="field-control"
                    >
                      {operators.map((operator) => (
                        <option key={operator.value} value={operator.value}>
                          {operator.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={filter.value}
                      disabled={["is_empty", "is_not_empty"].includes(filter.operator)}
                      onChange={(event) =>
                        setFilters((current) =>
                          current.map((item) =>
                            item.id === filter.id ? { ...item, value: event.target.value } : item,
                          ),
                        )
                      }
                      className="field-control"
                      placeholder="Value"
                    />
                    <button
                      type="button"
                      aria-label="Remove rule"
                      className="icon-button"
                      onClick={() =>
                        setFilters((current) => current.filter((item) => item.id !== filter.id))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-xs text-[var(--muted)]">
                  No rules. Every source record is included.
                </div>
              )}
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveMetric()}
            disabled={saving}
            className="primary-link"
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "Save new version"}
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
              ["Record date", String(resourceConfiguration?.timestampColumn ?? "Sync time")],
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
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[#090b0f] p-3 text-[10px] leading-5">
              {JSON.stringify(definition, null, 2)}
            </pre>
          </details>
        </section>
      </aside>
    </div>
  );
}
