"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Combine,
  Database,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Plus,
  Percent,
  RefreshCw,
  Search,
  Sigma,
  Table2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export type MetricConnection = {
  id: string;
  provider: string;
  providerName: string;
  logo: string;
  name: string;
  accountName: string | null;
  status: string;
  freshness: string;
  resources: string[];
};

export type MetricComponent = {
  metricId: string;
  versionId: string;
  name: string;
  description: string;
  sourceLabel: string;
};

type Spreadsheet = { id: string; name: string; modifiedTime?: string; webViewLink?: string };
type SheetTab = {
  id: number;
  name: string;
  index: number;
  hidden: boolean;
  rowCapacity: number;
  columnCount: number;
};
type DataField = {
  path: string;
  type: "null" | "boolean" | "number" | "string" | "date" | "array" | "object";
  nullable: boolean;
};
type Preview = {
  records: Record<string, unknown>[];
  fields: DataField[];
  fieldValues: Record<string, (string | number | boolean)[]>;
  totalRecords: number;
  matchingRecords: number;
  metricValue: number | null;
  numeratorValue?: number;
  denominatorValue?: number;
  refreshedAt: string;
};
type Calculation = "count" | "distinct_count" | "sum" | "average" | "percentage";
type OperandOperation = "count" | "count_non_empty" | "distinct_count" | "sum" | "average";
type FilterOperator =
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
type FilterRow = { id: string; field: string; operator: FilterOperator; value: string };
type RatioOperand = { operation: OperandOperation; field: string; filters: FilterRow[] };
type RatioPreview = { numerator: number; denominator: number; percentage: number | null };
const steps = [
  { label: "Source", detail: "App, account, and data", icon: Database },
  { label: "Test data", detail: "Recent real records", icon: RefreshCw },
  { label: "Metric", detail: "What to calculate", icon: Sigma },
  { label: "Filters", detail: "Which records count", icon: Filter },
  { label: "Review", detail: "Name and publish", icon: WandSparkles },
];

const filterOperators: { value: FilterOperator; label: string }[] = [
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

function inferClientFields(records: Record<string, unknown>[]): DataField[] {
  const names = new Set(records.flatMap((record) => Object.keys(record)));
  return [...names]
    .filter((name) => !name.startsWith("__namzi_"))
    .sort()
    .map((path) => {
      const values = records.map((record) => record[path]).filter((value) => value != null);
      const first = values[0];
      const type =
        typeof first === "number"
          ? "number"
          : typeof first === "boolean"
            ? "boolean"
            : typeof first === "string" && !Number.isNaN(Date.parse(first))
              ? "date"
              : "string";
      return { path, type, nullable: values.length !== records.length } as DataField;
    });
}

function fieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function filterPasses(record: Record<string, unknown>, filter: FilterRow): boolean {
  const current = record[filter.field];
  const empty = current === null || current === undefined || current === "";
  if (filter.operator === "is_empty") return empty;
  if (filter.operator === "is_not_empty") return !empty;
  const left = String(current ?? "").trim();
  const right = filter.value.trim();
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  if (filter.operator === "equals") return normalizedLeft === normalizedRight;
  if (filter.operator === "not_equals") return normalizedLeft !== normalizedRight;
  if (filter.operator === "contains") return normalizedLeft.includes(normalizedRight);
  if (filter.operator === "not_contains") return !normalizedLeft.includes(normalizedRight);
  if (filter.operator === "starts_with") return normalizedLeft.startsWith(normalizedRight);
  if (filter.operator === "ends_with") return normalizedLeft.endsWith(normalizedRight);
  const leftNumber = Number(current);
  const rightNumber = Number(filter.value);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  return filter.operator === "greater_than" ? leftNumber > rightNumber : leftNumber < rightNumber;
}

function evaluateOperand(records: Record<string, unknown>[], operand: RatioOperand): number {
  const matching = records.filter((record) =>
    operand.filters.every((filter) => filterPasses(record, filter)),
  );
  if (operand.operation === "count") return matching.length;
  const values = matching
    .map((record) => record[operand.field])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (operand.operation === "count_non_empty") return values.length;
  if (operand.operation === "distinct_count") {
    return new Set(values.map((value) => String(value))).size;
  }
  const numbers = values.map(Number).filter(Number.isFinite);
  const sum = numbers.reduce((total, value) => total + value, 0);
  return operand.operation === "average" && numbers.length ? sum / numbers.length : sum;
}

function OperandCalculationCard({
  label,
  description,
  operand,
  fields,
  onChange,
}: {
  label: string;
  description: string;
  operand: RatioOperand;
  fields: DataField[];
  onChange: (operand: RatioOperand) => void;
}) {
  const needsField = operand.operation !== "count";
  const availableFields = fields.filter((field) =>
    ["sum", "average"].includes(operand.operation) ? field.type === "number" : true,
  );
  return (
    <section className="ratio-side-card">
      <div className="flex items-center gap-3">
        <span className="ratio-side-badge">{label === "Numerator" ? "A" : "B"}</span>
        <div>
          <h4 className="text-sm font-semibold">{label}</h4>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
        </div>
      </div>
      <label className="mt-4 block">
        <span className="field-label">Calculation</span>
        <select
          className="field-control mt-2 w-full"
          value={operand.operation}
          onChange={(event) => {
            const operation = event.target.value as OperandOperation;
            const numericOnly = ["sum", "average"].includes(operation);
            const nextField = numericOnly
              ? (fields.find((field) => field.type === "number")?.path ?? "")
              : operand.field || fields[0]?.path || "";
            onChange({ ...operand, operation, field: nextField });
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
            value={operand.field}
            onChange={(event) => onChange({ ...operand, field: event.target.value })}
          >
            {availableFields.map((field) => (
              <option key={field.path} value={field.path}>
                {field.path} · {field.type}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-3 rounded-lg bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--muted)]">
          Every row that passes this side&apos;s rules counts once.
        </p>
      )}
    </section>
  );
}

function OperandRulesCard({
  label,
  operand,
  fields,
  fieldValues,
  onChange,
}: {
  label: string;
  operand: RatioOperand;
  fields: DataField[];
  fieldValues: Preview["fieldValues"];
  onChange: (operand: RatioOperand) => void;
}) {
  const [openRule, setOpenRule] = useState<string | null>(null);
  function updateRule(id: string, patch: Partial<FilterRow>) {
    onChange({
      ...operand,
      filters: operand.filters.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });
  }
  return (
    <section className="ratio-side-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{label} rules</h4>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {operand.filters.length ? `${operand.filters.length} AND rule(s)` : "All source rows"}
          </p>
        </div>
        <button
          type="button"
          className="secondary-link"
          onClick={() =>
            onChange({
              ...operand,
              filters: [
                ...operand.filters,
                {
                  id: crypto.randomUUID(),
                  field: fields[0]?.path ?? "",
                  operator: "equals",
                  value: "",
                },
              ],
            })
          }
        >
          <Plus size={14} /> Add rule
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {operand.filters.length ? (
          operand.filters.map((rule) => (
            <div className="ratio-rule" key={rule.id}>
              <select
                className="field-control"
                value={rule.field}
                onChange={(event) => updateRule(rule.id, { field: event.target.value, value: "" })}
              >
                {fields.map((field) => (
                  <option key={field.path} value={field.path}>
                    {field.path}
                  </option>
                ))}
              </select>
              <select
                className="field-control"
                value={rule.operator}
                onChange={(event) =>
                  updateRule(rule.id, { operator: event.target.value as FilterOperator })
                }
              >
                {filterOperators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              {!["is_empty", "is_not_empty"].includes(rule.operator) ? (
                <div className="relative min-w-0">
                  <input
                    className="field-control w-full pr-9"
                    value={rule.value}
                    placeholder="Choose or type value"
                    onChange={(event) => updateRule(rule.id, { value: event.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-white"
                    aria-label={`Show values for ${rule.field}`}
                    onClick={() => setOpenRule((current) => (current === rule.id ? null : rule.id))}
                  >
                    <ChevronDown size={15} />
                  </button>
                  {openRule === rule.id ? (
                    <div className="value-menu">
                      {(fieldValues[rule.field] ?? []).length ? (
                        (fieldValues[rule.field] ?? []).map((value) => (
                          <button
                            type="button"
                            key={String(value)}
                            onClick={() => {
                              updateRule(rule.id, { value: String(value) });
                              setOpenRule(null);
                            }}
                          >
                            {String(value)}
                          </button>
                        ))
                      ) : (
                        <span>No tested values found.</span>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="field-control text-xs text-[var(--muted)]">No value needed</div>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${label.toLocaleLowerCase()} rule`}
                onClick={() =>
                  onChange({
                    ...operand,
                    filters: operand.filters.filter((item) => item.id !== rule.id),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--line)] px-4 py-6 text-center text-xs text-[var(--muted)]">
            No rules — all source rows are included on this side.
          </div>
        )}
      </div>
    </section>
  );
}

function InfoTooltip({ label }: { label: string }) {
  return (
    <span className="tooltip-anchor ml-1 inline-flex align-middle" tabIndex={0}>
      <CircleHelp size={13} aria-label={label} />
      <span className="tooltip-content" role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function MetricBuilder({
  connections,
  metricComponents,
  initialConnectionId,
}: {
  connections: MetricConnection[];
  metricComponents: MetricComponent[];
  initialConnectionId?: string;
}) {
  const router = useRouter();
  const initialConnection = connections.find((item) => item.id === initialConnectionId) ?? null;
  const [step, setStep] = useState(0);
  const [connection, setConnection] = useState<MetricConnection | null>(initialConnection);
  const [sourceMode, setSourceMode] = useState<"single" | "combine">("single");
  const [numeratorVersionId, setNumeratorVersionId] = useState("");
  const [denominatorVersionId, setDenominatorVersionId] = useState("");
  const [ratioPreview, setRatioPreview] = useState<RatioPreview | null>(null);
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [spreadsheetQuery, setSpreadsheetQuery] = useState("");
  const [spreadsheetPickerOpen, setSpreadsheetPickerOpen] = useState(false);
  const [spreadsheet, setSpreadsheet] = useState<Spreadsheet | null>(null);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [tab, setTab] = useState<SheetTab | null>(null);
  const [genericResource, setGenericResource] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedRecord, setSelectedRecord] = useState(0);
  const [calculation, setCalculation] = useState<Calculation>("count");
  const [calculationField, setCalculationField] = useState("");
  const [numeratorOperand, setNumeratorOperand] = useState<RatioOperand>({
    operation: "count",
    field: "",
    filters: [],
  });
  const [denominatorOperand, setDenominatorOperand] = useState<RatioOperand>({
    operation: "count",
    field: "",
    filters: [],
  });
  const [uniqueKeyField, setUniqueKeyField] = useState("");
  const [timestampField, setTimestampField] = useState("");
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [visualizationColor, setVisualizationColor] = useState("#8b5cf6");
  const [goalTarget, setGoalTarget] = useState("");
  const [name, setName] = useState("New metric");
  const [category, setCategory] = useState("Uncategorized");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openValueMenu, setOpenValueMenu] = useState<string | null>(null);
  const spreadsheetPickerRef = useRef<HTMLDivElement>(null);

  const sourceReady =
    sourceMode === "combine"
      ? Boolean(
          numeratorVersionId && denominatorVersionId && numeratorVersionId !== denominatorVersionId,
        )
      : Boolean(
          connection &&
          (connection.provider === "google-sheets" ? spreadsheet && tab : genericResource),
        );
  const fields = useMemo(() => preview?.fields ?? [], [preview?.fields]);
  const dataRecord = preview?.records[selectedRecord] ?? preview?.records[0];
  const numeratorMetric = metricComponents.find((item) => item.versionId === numeratorVersionId);
  const denominatorMetric = metricComponents.find(
    (item) => item.versionId === denominatorVersionId,
  );
  const currentSourceLabel =
    sourceMode === "combine"
      ? numeratorMetric && denominatorMetric
        ? `${numeratorMetric.name} ÷ ${denominatorMetric.name}`
        : "Choose two component metrics"
      : connection?.provider === "google-sheets"
        ? spreadsheet && tab
          ? `${spreadsheet.name} / ${tab.name}`
          : "Choose spreadsheet and tab"
        : genericResource || "Choose a data object";
  const testReady = sourceMode === "combine" ? Boolean(ratioPreview) : Boolean(preview);
  const dashboardHasTimeline =
    sourceMode === "single" &&
    calculation !== "percentage" &&
    (connection?.provider !== "google-sheets" || Boolean(timestampField));

  useEffect(() => {
    function closePicker(event: PointerEvent) {
      if (!spreadsheetPickerRef.current?.contains(event.target as Node)) {
        setSpreadsheetPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, []);

  const previewFilters = useMemo(
    () =>
      filters
        .filter((filter) => filter.field)
        .map((filter) => ({
          field: filter.field,
          operator: filter.operator,
          ...(!["is_empty", "is_not_empty"].includes(filter.operator)
            ? {
                value:
                  fields.find((field) => field.path === filter.field)?.type === "number"
                    ? Number(filter.value)
                    : filter.value,
              }
            : {}),
        })),
    [fields, filters],
  );

  function operandPayload(operand: RatioOperand) {
    return {
      operation: operand.operation,
      ...(operand.operation !== "count" && operand.field ? { field: operand.field } : {}),
      filters: operand.filters.map((filter) => ({
        field: filter.field,
        operator: filter.operator,
        ...(!["is_empty", "is_not_empty"].includes(filter.operator)
          ? {
              value:
                fields.find((field) => field.path === filter.field)?.type === "number"
                  ? Number(filter.value)
                  : filter.value,
            }
          : {}),
      })),
    };
  }

  async function loadSpreadsheets(target: MetricConnection, query = "") {
    setLoading(true);
    setError(null);
    setSpreadsheetPickerOpen(true);
    try {
      const parameters = new URLSearchParams();
      if (query.trim()) parameters.set("query", query.trim());
      const response = await fetch(
        `/api/connections/${target.id}/resources${parameters.size ? `?${parameters}` : ""}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        data?: Spreadsheet[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not load spreadsheets.");
      setSpreadsheets(result.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load spreadsheets.");
    } finally {
      setLoading(false);
    }
  }

  async function chooseConnection(target: MetricConnection) {
    setSourceMode("single");
    setConnection(target);
    setSpreadsheet(null);
    setTab(null);
    setTabs([]);
    setPreview(null);
    setGenericResource(target.resources[0] ?? "");
    setError(null);
    if (target.provider === "google-sheets") await loadSpreadsheets(target);
  }

  async function chooseSpreadsheet(target: Spreadsheet) {
    if (!connection) return;
    setSpreadsheetPickerOpen(false);
    setSpreadsheet(target);
    setTab(null);
    setTabs([]);
    setPreview(null);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/connections/${connection.id}/resources/${encodeURIComponent(target.id)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        data?: { tabs: SheetTab[] };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not load worksheet tabs.");
      setTabs(result.data?.tabs ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load worksheet tabs.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview(options: { targetTab?: SheetTab; useFilters?: boolean } = {}) {
    if (!connection) return;
    const selectedTab = options.targetTab ?? tab;
    setLoading(true);
    setError(null);
    setSelectedRecord(0);
    try {
      if (connection.provider === "google-sheets") {
        if (!spreadsheet || !selectedTab) return;
        const response = await fetch(`/api/connections/${connection.id}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheetId: spreadsheet.id,
            sheetName: selectedTab.name,
            limit: 3,
            filters: options.useFilters ? previewFilters : [],
            calculation: {
              operation: calculation,
              ...(calculation !== "count" && calculationField ? { field: calculationField } : {}),
              ...(calculation === "percentage"
                ? {
                    numerator: operandPayload(numeratorOperand),
                    denominator: operandPayload(denominatorOperand),
                  }
                : {}),
            },
          }),
        });
        const result = (await response.json()) as {
          data?: Preview;
          error?: { message?: string };
        };
        if (!response.ok || !result.data) {
          throw new Error(result.error?.message ?? "Could not test this worksheet.");
        }
        setPreview(result.data);
        if (!calculationField) {
          const numeric = result.data.fields.find((field) => field.type === "number");
          const defaultField = numeric?.path ?? result.data.fields[0]?.path ?? "";
          setCalculationField(defaultField);
          setNumeratorOperand((current) => ({ ...current, field: current.field || defaultField }));
          setDenominatorOperand((current) => ({
            ...current,
            field: current.field || defaultField,
          }));
        }
        return;
      }
      const response = await fetch(`/api/connections/${connection.id}/samples`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        data?: Record<string, unknown>[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not test this source.");
      const records = result.data ?? [];
      const loadedFields = inferClientFields(records);
      const defaultField =
        loadedFields.find((field) => field.type === "number")?.path ?? loadedFields[0]?.path ?? "";
      if (!calculationField) setCalculationField(defaultField);
      setNumeratorOperand((current) => ({ ...current, field: current.field || defaultField }));
      setDenominatorOperand((current) => ({ ...current, field: current.field || defaultField }));
      const baseMatching = records.filter((record) =>
        (options.useFilters ? filters : []).every((filter) => filterPasses(record, filter)),
      );
      let metricValue: number | null = baseMatching.length;
      let numeratorValue: number | undefined;
      let denominatorValue: number | undefined;
      if (calculation === "percentage") {
        numeratorValue = evaluateOperand(baseMatching, numeratorOperand);
        denominatorValue = evaluateOperand(baseMatching, denominatorOperand);
        metricValue = denominatorValue ? (numeratorValue / denominatorValue) * 100 : null;
      } else if (calculation !== "count") {
        metricValue = evaluateOperand(baseMatching, {
          operation: calculation,
          field: calculationField,
          filters: [],
        });
      }
      setPreview({
        records: baseMatching.slice(-3),
        fields: loadedFields,
        fieldValues: Object.fromEntries(
          loadedFields.map((field) => [
            field.path,
            [
              ...new Set(
                records.flatMap((record) => {
                  const value = record[field.path];
                  return typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean"
                    ? [value]
                    : [];
                }),
              ),
            ].slice(0, 50),
          ]),
        ),
        totalRecords: records.length,
        matchingRecords: baseMatching.length,
        metricValue,
        numeratorValue,
        denominatorValue,
        refreshedAt: new Date().toISOString(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not test this source.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRatioPreview() {
    if (!numeratorVersionId || !denominatorVersionId) return;
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86_400_000);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const loadValue = async (versionId: string) => {
        const response = await fetch(`/api/metric-versions/${versionId}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: start.toISOString(), end: end.toISOString(), timezone }),
        });
        const result = (await response.json()) as {
          data?: { current?: { value?: number | null } };
          error?: { message?: string };
        };
        if (!response.ok) {
          throw new Error(result.error?.message ?? "Could not evaluate a component metric.");
        }
        return Number(result.data?.current?.value ?? 0);
      };
      const [numerator, denominator] = await Promise.all([
        loadValue(numeratorVersionId),
        loadValue(denominatorVersionId),
      ]);
      setRatioPreview({
        numerator,
        denominator,
        percentage: denominator === 0 ? null : (numerator / denominator) * 100,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not test combined metrics.");
    } finally {
      setLoading(false);
    }
  }

  async function chooseTab(target: SheetTab) {
    setTab(target);
    setPreview(null);
    await loadPreview({ targetTab: target });
  }

  function addFilter() {
    setFilters((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        field: fields[0]?.path ?? "",
        operator: "equals",
        value: "",
      },
    ]);
  }

  async function publishMetric() {
    if (!sourceReady || !testReady || !name.trim()) return;
    const parsedGoal = goalTarget.trim() ? Number(goalTarget) : null;
    if (parsedGoal !== null && (!Number.isFinite(parsedGoal) || parsedGoal < 0)) {
      setError("Enter a valid KPI goal of zero or more.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      if (sourceMode === "combine") {
        const response = await fetch("/api/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: `${numeratorMetric?.name ?? "Numerator"} as a percentage of ${denominatorMetric?.name ?? "denominator"}`,
            definition: {
              dataset: "source_records",
              category: category.trim() || "Uncategorized",
              measure: {
                operation: "ratio",
                numeratorMetricVersionId: numeratorVersionId,
                denominatorMetricVersionId: denominatorVersionId,
                asPercentage: true,
              },
              filters: [],
              groupBy: [],
              comparison: "previous_period",
              ...(parsedGoal !== null ? { goal: { target: parsedGoal } } : {}),
              visualization: { display: "kpi", color: visualizationColor },
            },
          }),
        });
        const result = (await response.json()) as { error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message ?? "Could not publish the metric.");
        router.push("/metrics");
        router.refresh();
        return;
      }
      if (!connection || !preview) return;
      let resourceType = genericResource;
      let resourceId = genericResource;
      if (connection.provider === "google-sheets" && spreadsheet && tab) {
        resourceId = `${spreadsheet.id}:${tab.id}`;
        resourceType = `google-sheet:${resourceId}`;
        const tracked = await fetch(`/api/connections/${connection.id}/resources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheetId: spreadsheet.id,
            spreadsheetName: spreadsheet.name,
            sheetId: tab.id,
            sheetName: tab.name,
            columnCount: Math.max(1, tab.columnCount),
            ...(uniqueKeyField ? { uniqueKeyColumn: uniqueKeyField } : {}),
            ...(timestampField ? { timestampColumn: timestampField } : {}),
          }),
        });
        const trackedResult = (await tracked.json()) as { error?: { message?: string } };
        if (!tracked.ok) {
          throw new Error(trackedResult.error?.message ?? "Could not start source syncing.");
        }
      }
      const fieldTypes = Object.fromEntries(
        fields.map((field) => [`data.${field.path}`, field.type]),
      );
      const definition = {
        dataset: "source_records",
        category: category.trim() || "Uncategorized",
        source: {
          connectionId: connection.id,
          provider: connection.provider,
          resourceType,
          resourceId,
          ...(spreadsheet
            ? { spreadsheetId: spreadsheet.id, spreadsheetName: spreadsheet.name }
            : {}),
          ...(tab ? { sheetId: tab.id, sheetName: tab.name } : {}),
          fieldTypes,
        },
        measure:
          calculation === "count"
            ? { operation: "count" }
            : calculation === "percentage"
              ? {
                  operation: "percentage",
                  numerator: {
                    ...operandPayload(numeratorOperand),
                    ...(numeratorOperand.field ? { field: `data.${numeratorOperand.field}` } : {}),
                    filters: operandPayload(numeratorOperand).filters.map((filter) => ({
                      ...filter,
                      field: `data.${filter.field}`,
                    })),
                  },
                  denominator: {
                    ...operandPayload(denominatorOperand),
                    ...(denominatorOperand.field
                      ? { field: `data.${denominatorOperand.field}` }
                      : {}),
                    filters: operandPayload(denominatorOperand).filters.map((filter) => ({
                      ...filter,
                      field: `data.${filter.field}`,
                    })),
                  },
                }
              : { operation: calculation, field: `data.${calculationField}` },
        filters: previewFilters.map((filter) => ({ ...filter, field: `data.${filter.field}` })),
        timeField: "occurred_at",
        groupBy: [],
        comparison: "previous_period",
        ...(parsedGoal !== null ? { goal: { target: parsedGoal } } : {}),
        visualization: { display: "kpi", color: visualizationColor },
      };
      const response = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: `${calculation.replaceAll("_", " ")} from ${currentSourceLabel}`,
          definition,
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not publish the metric.");
      router.push("/metrics");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish the metric.");
    } finally {
      setPublishing(false);
    }
  }

  function nextStep() {
    if (step === 0 && sourceReady && !testReady) {
      if (sourceMode === "combine") void loadRatioPreview();
      else void loadPreview();
    }
    setStep((current) => Math.min(4, current + 1));
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/metrics" className="eyebrow-link">
            <ArrowLeft size={14} /> Metrics
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Build a metric</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Choose real source data, inspect recent records, then define what should count.
          </p>
        </div>
        <div className="status-pill">
          <span
            className={`status-dot ${testReady ? "bg-[var(--success)]" : "bg-[var(--muted)]"}`}
          />
          {testReady ? "Live result loaded" : "Waiting for source"}
        </div>
      </div>

      {connections.length === 0 && metricComponents.length < 2 ? (
        <section className="shell-card mt-7 p-12 text-center">
          <Database size={28} className="mx-auto text-[var(--muted)]" />
          <h2 className="mt-4 text-xl font-semibold">Connect a data source first</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            A metric needs at least one active provider account.
          </p>
          <Link href="/integrations" className="primary-link mt-5">
            Open integrations <ArrowRight size={15} />
          </Link>
        </section>
      ) : (
        <div className="mt-7 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_390px]">
          <nav className="builder-steps" aria-label="Metric builder steps">
            {steps.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => index <= step && setStep(index)}
                className={`builder-step ${index === step ? "builder-step-active" : ""}`}
              >
                <span className="builder-step-number">
                  {index < step ? <Check size={14} /> : index + 1}
                </span>
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                    {item.detail}
                  </span>
                </span>
              </button>
            ))}
          </nav>

          <main className="shell-card min-h-[670px] overflow-hidden">
            <div className="border-b border-[var(--line)] px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Step {step + 1} of {steps.length}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{steps[step]?.label}</h2>
            </div>
            <div className="p-6">
              {step === 0 ? (
                <div>
                  <div className="mb-6 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSourceMode("single");
                        setRatioPreview(null);
                      }}
                      className={`source-option ${sourceMode === "single" ? "source-option-active" : ""}`}
                    >
                      <Database size={18} />
                      <span className="text-left">
                        <span className="block text-sm font-semibold">Single source</span>
                        <span className="mt-1 block text-xs text-[var(--muted)]">
                          Build from one integration
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceMode("combine");
                        setPreview(null);
                        setCalculation("percentage");
                      }}
                      disabled={metricComponents.length < 2}
                      className={`source-option ${sourceMode === "combine" ? "source-option-active" : ""}`}
                    >
                      <Combine size={18} />
                      <span className="text-left">
                        <span className="block text-sm font-semibold">Combine metrics</span>
                        <span className="mt-1 block text-xs text-[var(--muted)]">
                          Percentage across sources
                        </span>
                      </span>
                    </button>
                  </div>

                  {sourceMode === "single" ? (
                    <>
                      <label className="field-label">Connected account</label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {connections.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => void chooseConnection(item)}
                            className={`source-option ${connection?.id === item.id ? "source-option-active" : ""}`}
                          >
                            <span className="provider-mark size-10">{item.logo}</span>
                            <span className="min-w-0 text-left">
                              <span className="block truncate text-sm font-semibold">
                                {item.providerName}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                                {item.accountName ?? item.name}
                              </span>
                            </span>
                            {connection?.id === item.id ? (
                              <Check size={16} className="ml-auto text-[var(--accent)]" />
                            ) : null}
                          </button>
                        ))}
                      </div>

                      {connection?.provider === "google-sheets" ? (
                        <div className="mt-7">
                          <div className="flex items-end justify-between gap-3">
                            <label className="field-label">Spreadsheet</label>
                            <button
                              type="button"
                              onClick={() => void loadSpreadsheets(connection, spreadsheetQuery)}
                              className="text-button"
                            >
                              <RefreshCw size={13} /> Refresh
                            </button>
                          </div>
                          <div ref={spreadsheetPickerRef} className="mt-2">
                            <div className="relative">
                              <Search
                                size={16}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                              />
                              <input
                                value={spreadsheetQuery}
                                onFocus={() => setSpreadsheetPickerOpen(true)}
                                onChange={(event) => {
                                  setSpreadsheetQuery(event.target.value);
                                  setSpreadsheetPickerOpen(true);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter")
                                    void loadSpreadsheets(connection, spreadsheetQuery);
                                }}
                                placeholder="Search all spreadsheets in this Google account"
                                className="field-control search-control w-full"
                              />
                            </div>
                            {spreadsheetPickerOpen ? (
                              <div className="data-picker mt-3 max-h-56 overflow-y-auto">
                                {loading && spreadsheets.length === 0 ? (
                                  <div className="picker-empty">
                                    <LoaderCircle size={17} className="animate-spin" /> Loading
                                    spreadsheets…
                                  </div>
                                ) : spreadsheets.length ? (
                                  spreadsheets.map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => void chooseSpreadsheet(item)}
                                      className={`data-picker-row ${spreadsheet?.id === item.id ? "data-picker-row-active" : ""}`}
                                    >
                                      <FileSpreadsheet size={17} className="text-emerald-400" />
                                      <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                                        {item.name}
                                      </span>
                                      <span className="text-[11px] text-[var(--muted)]">
                                        {item.modifiedTime
                                          ? new Date(item.modifiedTime).toLocaleDateString()
                                          : "Available"}
                                      </span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="picker-empty">
                                    No spreadsheets found for this account.
                                  </div>
                                )}
                              </div>
                            ) : spreadsheet ? (
                              <button
                                type="button"
                                onClick={() => setSpreadsheetPickerOpen(true)}
                                className="mt-3 flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-left text-sm"
                              >
                                <FileSpreadsheet size={16} className="text-emerald-400" />
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {spreadsheet.name}
                                </span>
                                <ChevronDown size={15} className="text-[var(--muted)]" />
                              </button>
                            ) : null}
                          </div>

                          {spreadsheet ? (
                            <div className="mt-6">
                              <label className="field-label">Worksheet tab</label>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {tabs.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => void chooseTab(item)}
                                    className={`source-option ${tab?.id === item.id ? "source-option-active" : ""}`}
                                  >
                                    <Table2 size={17} className="text-[var(--accent)]" />
                                    <span className="min-w-0 text-left">
                                      <span className="block truncate text-sm font-semibold">
                                        {item.name}
                                      </span>
                                      <span className="block text-[11px] text-[var(--muted)]">
                                        {item.columnCount} columns ·{" "}
                                        {item.rowCapacity.toLocaleString()} row capacity
                                      </span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : connection ? (
                        <label className="mt-7 block">
                          <span className="field-label">Data object</span>
                          <select
                            value={genericResource}
                            onChange={(event) => setGenericResource(event.target.value)}
                            className="field-control mt-2 w-full"
                          >
                            {connection.resources.map((resource) => (
                              <option key={resource} value={resource}>
                                {resource.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : (
                    <div>
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                        Reuse two published metrics from any integrations. Namzi keeps each
                        source&apos;s rules intact, then calculates numerator ÷ denominator × 100.
                      </div>
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="field-label">Numerator</span>
                          <select
                            value={numeratorVersionId}
                            onChange={(event) => {
                              setNumeratorVersionId(event.target.value);
                              setRatioPreview(null);
                            }}
                            className="field-control mt-2 w-full"
                          >
                            <option value="">Choose metric</option>
                            {metricComponents.map((component) => (
                              <option key={component.versionId} value={component.versionId}>
                                {component.name} · {component.sourceLabel}
                              </option>
                            ))}
                          </select>
                          <span className="mt-2 block text-[11px] text-[var(--muted)]">
                            e.g. Bookings
                          </span>
                        </label>
                        <label>
                          <span className="field-label">Denominator</span>
                          <select
                            value={denominatorVersionId}
                            onChange={(event) => {
                              setDenominatorVersionId(event.target.value);
                              setRatioPreview(null);
                            }}
                            className="field-control mt-2 w-full"
                          >
                            <option value="">Choose metric</option>
                            {metricComponents.map((component) => (
                              <option key={component.versionId} value={component.versionId}>
                                {component.name} · {component.sourceLabel}
                              </option>
                            ))}
                          </select>
                          <span className="mt-2 block text-[11px] text-[var(--muted)]">
                            e.g. SMS sent
                          </span>
                        </label>
                      </div>
                      {numeratorVersionId === denominatorVersionId && numeratorVersionId ? (
                        <div className="error-panel mt-4">Choose two different metrics.</div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              {step === 1 ? (
                <div>
                  {sourceMode === "combine" ? (
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">Test the combined percentage</h3>
                          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                            Both component metrics are evaluated over the same live 30-day window.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="secondary-link"
                          onClick={() => void loadRatioPreview()}
                        >
                          <RefreshCw size={14} /> Refresh values
                        </button>
                      </div>
                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="stat-tile">
                          <span>{numeratorMetric?.name ?? "Numerator"}</span>
                          <strong>{ratioPreview?.numerator.toLocaleString() ?? "—"}</strong>
                        </div>
                        <div className="stat-tile">
                          <span>{denominatorMetric?.name ?? "Denominator"}</span>
                          <strong>{ratioPreview?.denominator.toLocaleString() ?? "—"}</strong>
                        </div>
                        <div className="stat-tile border-[var(--accent)]/40">
                          <span>Combined percentage</span>
                          <strong>
                            {ratioPreview?.percentage === null || !ratioPreview
                              ? "—"
                              : `${formatMetricValue(ratioPreview.percentage)}%`}
                          </strong>
                        </div>
                      </div>
                      {ratioPreview?.percentage === null ? (
                        <div className="error-panel mt-5">
                          The denominator is zero in this period, so a percentage cannot be
                          calculated.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">Test with recent records</h3>
                          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                            These are real records returned from {currentSourceLabel}, not generated
                            examples.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="secondary-link"
                          onClick={() => void loadPreview()}
                        >
                          <RefreshCw size={14} /> Find new records
                        </button>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="stat-tile">
                          <span>Total rows found</span>
                          <strong>{preview?.totalRecords.toLocaleString() ?? "—"}</strong>
                        </div>
                        <div className="stat-tile">
                          <span>Fields detected</span>
                          <strong>{fields.length || "—"}</strong>
                        </div>
                        <div className="stat-tile">
                          <span>Last tested</span>
                          <strong className="text-sm">
                            {preview ? new Date(preview.refreshedAt).toLocaleTimeString() : "—"}
                          </strong>
                        </div>
                      </div>
                      <div className="mt-6 rounded-xl border border-[var(--line)]">
                        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                          <p className="text-sm font-semibold">Detected columns</p>
                          <span className="text-xs text-[var(--muted)]">From latest 100 rows</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {fields.map((field) => (
                            <div
                              key={field.path}
                              className="grid grid-cols-[1fr_90px] border-b border-[var(--line)] px-4 py-2.5 text-sm last:border-0"
                            >
                              <span className="truncate font-medium">{field.path}</span>
                              <span className="field-type">{field.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {connection?.provider === "google-sheets" ? (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                          <label>
                            <span className="field-label">
                              Unique row ID (optional)
                              <InfoTooltip label="A stable unique value lets Namzi update the same row instead of counting it twice. Use an ID or email only when it is always unique; otherwise keep the sheet row number." />
                            </span>
                            <select
                              value={uniqueKeyField}
                              onChange={(event) => setUniqueKeyField(event.target.value)}
                              className="field-control mt-2 w-full"
                            >
                              <option value="">Use sheet row number</option>
                              {fields.map((field) => (
                                <option key={field.path} value={field.path}>
                                  {field.path}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span className="field-label">
                              Record date (optional)
                              <InfoTooltip label="This date controls dashboard ranges and the card chart. Pick the real event date for historical reporting. Leave it empty when the sheet has no reliable date column." />
                            </span>
                            <select
                              value={timestampField}
                              onChange={(event) => setTimestampField(event.target.value)}
                              className="field-control mt-2 w-full"
                            >
                              <option value="">No record date (value-only card)</option>
                              {fields.map((field) => (
                                <option key={field.path} value={field.path}>
                                  {field.path}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {step === 2 ? (
                <div>
                  {sourceMode === "combine" ? (
                    <div>
                      <span className="icon-tile">
                        <Percent size={18} />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold">Cross-source percentage</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                        Namzi divides {numeratorMetric?.name ?? "the numerator"} by{" "}
                        {denominatorMetric?.name ?? "the denominator"} and displays the result as a
                        percentage. Each component keeps its own source, columns, and filter rules.
                      </p>
                      <div className="test-result mt-5">
                        <Check size={16} /> The combined formula is reusable across dashboards and
                        date ranges.
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold">What should this metric calculate?</h3>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Start with a simple operation. The result updates against every matching
                        record.
                      </p>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["count", "Count records", "How many rows match"],
                            ["distinct_count", "Count unique", "Unique values in one field"],
                            ["sum", "Sum", "Total of a numeric field"],
                            ["average", "Average", "Average of a numeric field"],
                            [
                              "percentage",
                              "Percentage / ratio",
                              "One calculation and rule set ÷ another",
                            ],
                          ] as const
                        ).map(([value, label, detail]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setCalculation(value);
                            }}
                            className={`calculation-option ${calculation === value ? "source-option-active" : ""}`}
                          >
                            <BarChart3 size={18} />
                            <span>
                              <span className="block text-sm font-semibold">{label}</span>
                              <span className="mt-1 block text-xs text-[var(--muted)]">
                                {detail}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                      {calculation === "percentage" ? (
                        <div className="mt-6">
                          <div className="ratio-formula-banner">
                            <span>A</span>
                            <strong>÷</strong>
                            <span>B</span>
                            <strong>× 100</strong>
                            <p>
                              Each side can count rows, count a column, count unique values, sum, or
                              average—and each side gets its own rules.
                            </p>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <OperandCalculationCard
                              label="Numerator"
                              description="The result you want to measure"
                              operand={numeratorOperand}
                              fields={fields}
                              onChange={setNumeratorOperand}
                            />
                            <OperandCalculationCard
                              label="Denominator"
                              description="The total or comparison base"
                              operand={denominatorOperand}
                              fields={fields}
                              onChange={setDenominatorOperand}
                            />
                          </div>
                        </div>
                      ) : calculation !== "count" ? (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                          <label>
                            <span className="field-label">Field to calculate</span>
                            <select
                              value={calculationField}
                              onChange={(event) => setCalculationField(event.target.value)}
                              className="field-control mt-2 w-full"
                            >
                              {fields
                                .filter((field) =>
                                  ["sum", "average"].includes(calculation)
                                    ? field.type === "number"
                                    : true,
                                )
                                .map((field) => (
                                  <option key={field.path} value={field.path}>
                                    {field.path} · {field.type}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void loadPreview({ useFilters: true })}
                        className="secondary-link mt-5"
                      >
                        <RefreshCw size={14} /> Test calculation
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {step === 3 ? (
                <div>
                  {sourceMode === "combine" ? (
                    <div>
                      <span className="icon-tile">
                        <Combine size={18} />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold">Rules come from the components</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                        {numeratorMetric?.name ?? "The numerator"} and{" "}
                        {denominatorMetric?.name ?? "the denominator"} keep the filters you already
                        published. Edit either component metric if one side of the ratio needs
                        different rules.
                      </p>
                    </div>
                  ) : (
                    <>
                      {calculation === "percentage" ? (
                        <>
                          <div>
                            <h3 className="text-lg font-semibold">
                              Define both sides of the ratio
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                              Numerator rules only affect A. Denominator rules only affect B. Leave
                              either side empty to use every source row for that side.
                            </p>
                          </div>
                          <div className="mt-6 grid gap-4 xl:grid-cols-2">
                            <OperandRulesCard
                              label="Numerator"
                              operand={numeratorOperand}
                              fields={fields}
                              fieldValues={preview?.fieldValues ?? {}}
                              onChange={setNumeratorOperand}
                            />
                            <OperandRulesCard
                              label="Denominator"
                              operand={denominatorOperand}
                              fields={fields}
                              fieldValues={preview?.fieldValues ?? {}}
                              onChange={setDenominatorOperand}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void loadPreview({ useFilters: true })}
                            className="primary-link mt-6"
                          >
                            {loading ? (
                              <LoaderCircle size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                            Test A ÷ B against live data
                          </button>
                          {preview ? (
                            <div className="test-result mt-5">
                              <Check size={16} />
                              <span>
                                Live result:{" "}
                                <strong>
                                  {preview.metricValue === null
                                    ? "Not available (B is zero)"
                                    : `${formatMetricValue(preview.metricValue)}%`}
                                </strong>
                              </span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-semibold">
                                Only include the records you want
                              </h3>
                              <p className="mt-1 text-sm text-[var(--muted)]">
                                All rules use AND logic. Every rule must pass for a row to count.
                              </p>
                            </div>
                            <button type="button" onClick={addFilter} className="secondary-link">
                              <Plus size={14} /> Add rule
                            </button>
                          </div>
                          {filters.length === 0 ? (
                            <button type="button" onClick={addFilter} className="empty-filter mt-6">
                              <Filter size={20} />
                              <span className="font-semibold">
                                No filters — every record will count
                              </span>
                              <span className="text-xs text-[var(--muted)]">
                                Add a rule to narrow the data.
                              </span>
                            </button>
                          ) : (
                            <div className="mt-6 space-y-3">
                              {filters.map((filter, index) => {
                                const suggestions = preview?.fieldValues[filter.field] ?? [];
                                return (
                                  <div key={filter.id} className="filter-row">
                                    <div className="mb-2 flex items-center justify-between sm:hidden">
                                      <span className="text-xs font-semibold text-[var(--muted)]">
                                        Rule {index + 1}
                                      </span>
                                    </div>
                                    <select
                                      value={filter.field}
                                      onChange={(event) =>
                                        setFilters((current) =>
                                          current.map((item) =>
                                            item.id === filter.id
                                              ? { ...item, field: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }
                                      className="field-control"
                                    >
                                      {fields.map((field) => (
                                        <option key={field.path} value={field.path}>
                                          {field.path}
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
                                                  operator: event.target.value as FilterOperator,
                                                }
                                              : item,
                                          ),
                                        )
                                      }
                                      className="field-control"
                                    >
                                      {filterOperators.map((operator) => (
                                        <option key={operator.value} value={operator.value}>
                                          {operator.label}
                                        </option>
                                      ))}
                                    </select>
                                    {!["is_empty", "is_not_empty"].includes(filter.operator) ? (
                                      <div className="relative min-w-0">
                                        <input
                                          value={filter.value}
                                          onChange={(event) =>
                                            setFilters((current) =>
                                              current.map((item) =>
                                                item.id === filter.id
                                                  ? { ...item, value: event.target.value }
                                                  : item,
                                              ),
                                            )
                                          }
                                          placeholder="Choose or type a value"
                                          className="field-control w-full pr-9"
                                        />
                                        <button
                                          type="button"
                                          aria-label={`Show values for ${filter.field}`}
                                          onClick={() =>
                                            setOpenValueMenu((current) =>
                                              current === filter.id ? null : filter.id,
                                            )
                                          }
                                          className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-white"
                                        >
                                          <ChevronDown size={15} />
                                        </button>
                                        {openValueMenu === filter.id ? (
                                          <div className="value-menu">
                                            {suggestions.length ? (
                                              suggestions.map((value) => (
                                                <button
                                                  type="button"
                                                  key={String(value)}
                                                  onClick={() => {
                                                    setFilters((current) =>
                                                      current.map((item) =>
                                                        item.id === filter.id
                                                          ? { ...item, value: String(value) }
                                                          : item,
                                                      ),
                                                    );
                                                    setOpenValueMenu(null);
                                                  }}
                                                >
                                                  {String(value)}
                                                </button>
                                              ))
                                            ) : (
                                              <span>No values found in the tested rows.</span>
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="field-control flex items-center text-xs text-[var(--muted)]">
                                        No value needed
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      aria-label={`Remove rule ${index + 1}`}
                                      onClick={() =>
                                        setFilters((current) =>
                                          current.filter((item) => item.id !== filter.id),
                                        )
                                      }
                                      className="icon-button"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => void loadPreview({ useFilters: true })}
                            className="primary-link mt-6"
                          >
                            {loading ? (
                              <LoaderCircle size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                            Test filters against live data
                          </button>
                          {preview ? (
                            <div className="test-result mt-5">
                              <Check size={16} />
                              <span>
                                <strong>{preview.matchingRecords.toLocaleString()}</strong> of{" "}
                                {preview.totalRecords.toLocaleString()} records pass these rules.
                              </span>
                            </div>
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {step === 4 ? (
                <div>
                  <h3 className="text-lg font-semibold">Review and publish</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Namzi will sync this source and keep the published metric updated.
                  </p>
                  <label className="mt-6 block">
                    <span className="field-label">Metric name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="field-control mt-2 w-full text-base font-semibold"
                      placeholder="e.g. Qualified leads"
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="field-label">Category</span>
                    <input
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="field-control mt-2 w-full"
                      placeholder="e.g. Sales, Acquisition, Delivery"
                      maxLength={80}
                    />
                    <span className="mt-2 block text-xs text-[var(--muted)]">
                      Categories become dashboard filters and keep related metrics together.
                    </span>
                  </label>
                  <label className="mt-4 block">
                    <span className="field-label">KPI goal (optional)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={goalTarget}
                      onChange={(event) => setGoalTarget(event.target.value)}
                      className="field-control mt-2 w-full"
                      placeholder={
                        calculation === "percentage" || sourceMode === "combine"
                          ? "e.g. 35%"
                          : "e.g. 500"
                      }
                    />
                    <span className="mt-2 block text-xs text-[var(--muted)]">
                      The live card will show progress against this target.
                    </span>
                  </label>
                  <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <span className="field-label">Dashboard card</span>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Every metric uses a KPI card. A chart appears automatically when a real
                          record-date column is configured.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        Card color
                        <input
                          type="color"
                          value={visualizationColor}
                          onChange={(event) => setVisualizationColor(event.target.value)}
                          className="h-8 w-10 cursor-pointer rounded border border-[var(--line)] bg-transparent"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="mt-6 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
                    {[
                      ["Source", currentSourceLabel],
                      ["Category", category.trim() || "Uncategorized"],
                      [
                        "Calculation",
                        sourceMode === "combine"
                          ? "Cross-source percentage"
                          : calculation === "count"
                            ? "Count matching records"
                            : calculation === "percentage"
                              ? `${numeratorOperand.operation.replaceAll("_", " ")} ÷ ${denominatorOperand.operation.replaceAll("_", " ")} × 100`
                              : `${calculation.replaceAll("_", " ")} of ${calculationField}`,
                      ],
                      [
                        "Filters",
                        sourceMode === "combine"
                          ? "Inherited from component metrics"
                          : calculation === "percentage"
                            ? `${numeratorOperand.filters.length} numerator · ${denominatorOperand.filters.length} denominator rules`
                            : filters.length
                              ? `${filters.length} AND rules`
                              : "No filters",
                      ],
                      [
                        "Dashboard",
                        dashboardHasTimeline
                          ? `KPI card · ${timestampField ? `timeline from ${timestampField}` : "native timeline"}`
                          : "KPI card · value only",
                      ],
                      [
                        "KPI goal",
                        goalTarget.trim()
                          ? `${goalTarget}${calculation === "percentage" || sourceMode === "combine" ? "%" : ""}`
                          : "No goal set",
                      ],
                      [
                        "Live result",
                        sourceMode === "combine"
                          ? ratioPreview?.percentage === null || !ratioPreview
                            ? "Not available"
                            : `${formatMetricValue(ratioPreview.percentage)}%`
                          : preview
                            ? preview.metricValue === null
                              ? "Not available (denominator is zero)"
                              : `${formatMetricValue(preview.metricValue)}${calculation === "percentage" ? "%" : ""}`
                            : "Not tested",
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="grid grid-cols-[130px_1fr] gap-4 px-4 py-3 text-sm"
                      >
                        <span className="text-[var(--muted)]">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={publishMetric}
                    disabled={publishing || !name.trim() || !testReady}
                    className="primary-link mt-6"
                  >
                    {publishing ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    {publishing ? "Publishing metric…" : "Publish metric"}
                  </button>
                </div>
              ) : null}

              {error ? <div className="error-panel mt-6">{error}</div> : null}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-4">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0 || loading || publishing}
                className="secondary-link"
              >
                <ArrowLeft size={14} /> Back
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={loading || (step === 0 && !sourceReady) || (step >= 1 && !testReady)}
                  className="primary-link"
                >
                  Continue <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
          </main>

          <aside className="data-inspector">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] p-4">
              <div>
                <p className="text-sm font-semibold">Data inspector</p>
                <p className="mt-1 max-w-[250px] truncate text-xs text-[var(--muted)]">
                  {currentSourceLabel}
                </p>
              </div>
              <span className="live-badge">LIVE</span>
            </div>
            {sourceMode === "combine" ? (
              <div className="p-4">
                <div className="space-y-3">
                  {[numeratorMetric, denominatorMetric].map((component, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3"
                    >
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {index === 0 ? "Numerator" : "Denominator"}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {component?.name ?? "Not selected"}
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        {component?.sourceLabel ?? "Choose a published metric"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="mini-stat">
                    <span>Numerator</span>
                    <strong>{ratioPreview?.numerator.toLocaleString() ?? "—"}</strong>
                  </div>
                  <div className="mini-stat">
                    <span>Denominator</span>
                    <strong>{ratioPreview?.denominator.toLocaleString() ?? "—"}</strong>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4">
                  <span className="text-xs text-[var(--muted)]">Live percentage</span>
                  <strong className="mt-2 block text-3xl">
                    {ratioPreview?.percentage === null || !ratioPreview
                      ? "—"
                      : `${formatMetricValue(ratioPreview.percentage)}%`}
                  </strong>
                </div>
              </div>
            ) : preview?.records.length ? (
              <>
                <div className="flex gap-1 border-b border-[var(--line)] p-3">
                  {preview.records.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedRecord(index)}
                      className={`record-tab ${selectedRecord === index ? "record-tab-active" : ""}`}
                    >
                      Record {index + 1}
                    </button>
                  ))}
                </div>
                <div
                  className={`grid gap-2 border-b border-[var(--line)] p-4 ${calculation === "percentage" ? "grid-cols-3" : "grid-cols-2"}`}
                >
                  <div className="mini-stat">
                    <span>{calculation === "percentage" ? "Numerator A" : "Matching"}</span>
                    <strong>
                      {(calculation === "percentage"
                        ? preview.numeratorValue
                        : preview.matchingRecords
                      )?.toLocaleString() ?? "—"}
                    </strong>
                  </div>
                  {calculation === "percentage" ? (
                    <div className="mini-stat">
                      <span>Denominator B</span>
                      <strong>{preview.denominatorValue?.toLocaleString() ?? "—"}</strong>
                    </div>
                  ) : null}
                  <div className="mini-stat">
                    <span>{calculation === "percentage" ? "A ÷ B" : "Metric result"}</span>
                    <strong>
                      {preview.metricValue === null
                        ? "—"
                        : `${formatMetricValue(preview.metricValue)}${calculation === "percentage" ? "%" : ""}`}
                    </strong>
                  </div>
                </div>
                <div className="max-h-[510px] overflow-y-auto">
                  {fields.map((field) => (
                    <div key={field.path} className="inspector-field">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-semibold text-[var(--muted)]">
                          {field.path}
                        </span>
                        <span className="field-type">{field.type}</span>
                      </div>
                      <p className="mt-1.5 break-words text-sm">
                        {fieldValue(dataRecord?.[field.path])}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid min-h-[580px] place-items-center p-8 text-center">
                <div>
                  <Table2 size={24} className="mx-auto text-[var(--muted)]" />
                  <p className="mt-3 text-sm font-semibold">No test record loaded</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Select a source and Namzi will show the latest real records and every detected
                    field here.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
