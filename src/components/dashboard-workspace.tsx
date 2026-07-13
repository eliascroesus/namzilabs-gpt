"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  Settings2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  MetricVisualizations,
  type MetricVisualization,
  type VisualizationConfiguration,
} from "@/components/metric-visualizations";
import type { DatePreset } from "@/server/metrics/time";

export type DashboardMetric = MetricVisualization & {
  slug: string;
  changePercent: number | null;
  matchingCount: number;
  error: boolean;
};

export type SavedDashboard = {
  id: string;
  name: string;
  description: string;
  timezone: string;
  defaultDateRange: string;
  cards: {
    metricVersionId: string;
    cardType: "kpi" | "time_series" | "funnel" | "breakdown" | "goal";
    title: string;
    position: number;
    configuration: Record<string, unknown>;
  }[];
} | null;

const ranges: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
];

function formatMetricValue(value: number | null, percentage: boolean): string {
  if (value === null) return "—";
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return percentage ? `${formatted}%` : formatted;
}

function metricIdForVersion(metrics: DashboardMetric[], versionId: unknown): string | undefined {
  return metrics.find((metric) => metric.versionId === versionId)?.id;
}

export function DashboardWorkspace({
  metrics,
  dashboard,
  range,
  timezone,
}: {
  metrics: DashboardMetric[];
  dashboard: SavedDashboard;
  range: DatePreset;
  timezone: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const savedKpis = dashboard?.cards
    .filter((card) => card.cardType === "kpi")
    .sort((left, right) => left.position - right.position)
    .flatMap((card) => metricIdForVersion(metrics, card.metricVersionId) ?? []);
  const savedTrend = dashboard?.cards.find((card) => card.cardType === "time_series");
  const savedPie = dashboard?.cards.find((card) => card.cardType === "breakdown");
  const savedPieVersions = Array.isArray(savedPie?.configuration.metricVersionIds)
    ? savedPie.configuration.metricVersionIds
    : [];
  const defaultTrendMetric =
    metricIdForVersion(metrics, savedTrend?.metricVersionId) ??
    metrics.find((metric) => metric.trendEligible)?.id ??
    "";
  const defaultPieMetrics = savedPieVersions.flatMap(
    (versionId) => metricIdForVersion(metrics, versionId) ?? [],
  );
  const fallbackPieMetrics = metrics
    .filter((metric) => !metric.percentage && metric.value !== null)
    .slice(0, 3)
    .map((metric) => metric.id);
  const [dashboardId, setDashboardId] = useState(dashboard?.id ?? null);
  const [metricOrder, setMetricOrder] = useState<string[]>(
    dashboard ? (savedKpis ?? []) : metrics.map((metric) => metric.id),
  );
  const [showTrend, setShowTrend] = useState(dashboard ? Boolean(savedTrend) : true);
  const [showPie, setShowPie] = useState(dashboard ? Boolean(savedPie) : true);
  const [visualization, setVisualization] = useState<VisualizationConfiguration>({
    trendMetricId: defaultTrendMetric,
    chartType: savedTrend?.configuration.chartType === "bar" ? "bar" : "line",
    pieMetricIds: defaultPieMetrics.length ? defaultPieMetrics : fallbackPieMetrics,
  });
  const [category, setCategory] = useState("All metrics");
  const [customizing, setCustomizing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => ["All metrics", ...new Set(metrics.map((metric) => metric.category))],
    [metrics],
  );
  const visibleMetrics = metricOrder.flatMap((id) => {
    const metric = metrics.find((item) => item.id === id);
    if (!metric || (category !== "All metrics" && metric.category !== category)) return [];
    return [metric];
  });
  const hiddenMetrics = metrics.filter((metric) => !metricOrder.includes(metric.id));

  function changed() {
    setDirty(true);
    setSaved(false);
  }

  function moveMetric(id: string, direction: -1 | 1) {
    setMetricOrder((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
    changed();
  }

  function dropMetric(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setMetricOrder((current) => {
      const next = current.filter((id) => id !== draggingId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, draggingId);
      return next;
    });
    setDraggingId(null);
    changed();
  }

  function updateVisualization(next: VisualizationConfiguration) {
    setVisualization(next);
    changed();
  }

  function selectRange(next: DatePreset) {
    router.push(`${pathname}?range=${next}`);
  }

  async function saveDashboard() {
    setSaving(true);
    setError(null);
    try {
      const orderedMetrics = metricOrder.flatMap(
        (id) => metrics.find((metric) => metric.id === id) ?? [],
      );
      const trendMetric = metrics.find(
        (metric) => metric.id === visualization.trendMetricId && metric.trendEligible,
      );
      const pieMetrics = visualization.pieMetricIds.flatMap((id) => {
        const metric = metrics.find(
          (item) => item.id === id && !item.percentage && item.value !== null,
        );
        return metric ? [metric] : [];
      });
      const cards: {
        metricVersionId: string;
        cardType: "kpi" | "time_series" | "breakdown";
        title: string;
        configuration: Record<string, unknown>;
      }[] = orderedMetrics.map((metric) => ({
        metricVersionId: metric.versionId,
        cardType: "kpi" as const,
        title: metric.name,
        configuration: { category: metric.category },
      }));
      if (showTrend && trendMetric) {
        cards.push({
          metricVersionId: trendMetric.versionId,
          cardType: "time_series",
          title: `${trendMetric.name} trend`,
          configuration: { chartType: visualization.chartType },
        });
      }
      if (showPie && pieMetrics.length) {
        cards.push({
          metricVersionId: pieMetrics[0]!.versionId,
          cardType: "breakdown",
          title: "Metric mix",
          configuration: { metricVersionIds: pieMetrics.map((metric) => metric.versionId) },
        });
      }
      const response = await fetch(
        dashboardId ? `/api/dashboards/${dashboardId}` : "/api/dashboards",
        {
          method: dashboardId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dashboard?.name ?? "Main dashboard",
            description: "Custom metric command center",
            timezone,
            defaultDateRange: range,
            cards,
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data) {
        throw new Error(result.error?.message ?? "The dashboard could not be saved.");
      }
      setDashboardId(result.data.id);
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The dashboard could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="dashboard-toolbar mt-7">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">Reporting window</p>
          <div className="timeline-selector mt-2" aria-label="Dashboard date range">
            {ranges.map((option) => (
              <button
                key={option.value}
                type="button"
                className={range === option.value ? "active" : ""}
                onClick={() => selectRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={customizing ? "primary-link" : "secondary-link"}
          onClick={() => setCustomizing((current) => !current)}
        >
          <Settings2 size={15} /> {customizing ? "Finish customizing" : "Customize dashboard"}
        </button>
      </section>

      {customizing ? (
        <section className="dashboard-customizer mt-4">
          <div>
            <div className="flex items-center gap-2">
              <LayoutDashboard size={17} className="text-[var(--brand)]" />
              <h2 className="font-semibold">Dashboard layout</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Drag cards to rearrange them, hide metrics, or turn visual sections on and off.
            </p>
          </div>
          <div className="dashboard-view-toggles">
            {[
              ["Trend graph", showTrend, setShowTrend],
              ["Pie chart", showPie, setShowPie],
            ].map(([label, enabled, setter]) => (
              <label key={String(label)}>
                <input
                  type="checkbox"
                  checked={Boolean(enabled)}
                  onChange={(event) => {
                    (setter as (value: boolean) => void)(event.target.checked);
                    changed();
                  }}
                />
                {String(label)}
              </label>
            ))}
          </div>
          <div className="dashboard-hidden-metrics">
            <p className="text-xs font-semibold text-[var(--muted)]">Hidden metrics</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {hiddenMetrics.length ? (
                hiddenMetrics.map((metric) => (
                  <button
                    type="button"
                    className="restore-metric-button"
                    key={metric.id}
                    onClick={() => {
                      setMetricOrder((current) => [...current, metric.id]);
                      changed();
                    }}
                  >
                    <Plus size={13} /> {metric.name}
                  </button>
                ))
              ) : (
                <span className="text-xs text-[var(--muted)]">Every metric is visible.</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
            {saved ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
                <Check size={13} /> Saved
              </span>
            ) : null}
            <button
              type="button"
              className="primary-link"
              disabled={!dirty || saving}
              onClick={() => void saveDashboard()}
            >
              {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Saving…" : "Save dashboard"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Live metrics</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Every card uses the selected reporting window and its prior-period comparison.
            </p>
          </div>
          <div className="category-filter" aria-label="Metric categories">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {visibleMetrics.length ? (
          <div className="dashboard-metric-grid mt-3">
            {visibleMetrics.map((metric) => {
              const change = metric.changePercent;
              const positive = typeof change === "number" && change >= 0;
              const index = metricOrder.indexOf(metric.id);
              const card = (
                <article
                  className={`dashboard-metric-card shell-card ${customizing ? "dashboard-metric-card-editing" : ""}`}
                  draggable={customizing}
                  onDragStart={() => setDraggingId(metric.id)}
                  onDragOver={(event) => customizing && event.preventDefault()}
                  onDrop={() => dropMetric(metric.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="metric-category-badge">{metric.category}</span>
                      <p className="mt-2 truncate text-sm font-semibold text-[var(--foreground)]">
                        {metric.name}
                      </p>
                    </div>
                    {customizing ? (
                      <div className="metric-card-controls">
                        <GripVertical size={15} aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => moveMetric(metric.id, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${metric.name} left`}
                        >
                          <ArrowLeft size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMetric(metric.id, 1)}
                          disabled={index === metricOrder.length - 1}
                          aria-label={`Move ${metric.name} right`}
                        >
                          <ArrowRight size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMetricOrder((current) => current.filter((id) => id !== metric.id));
                            changed();
                          }}
                          aria-label={`Hide ${metric.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`status-dot ${metric.error ? "bg-[var(--danger)]" : "bg-[var(--success)]"}`}
                      />
                    )}
                  </div>
                  <p className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
                    {metric.error ? "—" : formatMetricValue(metric.value, metric.percentage)}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
                    {typeof change === "number" ? (
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${positive ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                      >
                        {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {positive ? "+" : ""}
                        {change.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">No prior comparison</span>
                    )}
                    <span className="text-[var(--muted)]">
                      {metric.matchingCount.toLocaleString()} rows
                    </span>
                  </div>
                  {customizing ? (
                    <div className="mt-4 flex items-center gap-1 text-[10px] text-[var(--muted)]">
                      <Eye size={12} /> Drag to move · <EyeOff size={12} /> hide with ×
                    </div>
                  ) : null}
                </article>
              );
              return customizing ? (
                <div key={metric.id}>{card}</div>
              ) : (
                <Link key={metric.id} href={`/metrics/${metric.slug}`}>
                  {card}
                </Link>
              );
            })}
          </div>
        ) : metrics.length ? (
          <div className="shell-card mt-3 px-6 py-10 text-center">
            <EyeOff size={22} className="mx-auto text-[var(--muted)]" />
            <p className="mt-3 text-sm font-semibold">No visible metrics in this category</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Choose another category or customize the dashboard to restore cards.
            </p>
          </div>
        ) : (
          <div className="shell-card mt-3 px-6 py-12 text-center">
            <LayoutDashboard size={24} className="mx-auto text-[var(--muted)]" />
            <h3 className="mt-4 font-semibold">Build your first dashboard metric</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Connect a source, build a metric, and it will be ready to arrange here.
            </p>
            <Link href="/metrics/new" className="primary-link mt-5">
              Build metric <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>

      <MetricVisualizations
        metrics={metrics}
        configuration={visualization}
        onConfigurationChange={updateVisualization}
        showTrend={showTrend}
        showPie={showPie}
      />
    </>
  );
}
