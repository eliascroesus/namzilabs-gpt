"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  GripVertical,
  LayoutGrid,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { DatePreset } from "@/server/metrics/time";

export type DashboardMetricCardData = {
  id: string;
  versionId: string;
  slug: string;
  name: string;
  category: string;
  sourceLabel: string;
  value: number | null;
  percentage: boolean;
  color: string;
  points: { date: string; value: number; estimated: boolean }[];
  hasTimeline: boolean;
  changePercent: number | null;
  error: boolean;
};

export type MetricCardDashboard = {
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

type CardSize = "standard" | "large";

function formatMetricValue(value: number | null, percentage: boolean): string {
  if (value === null) return "—";
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  });
  return percentage ? `${formatted}%` : formatted;
}

function formatPointDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function TrendBars({ metric, large }: { metric: DashboardMetricCardData; large: boolean }) {
  const points = metric.points.slice(large ? -30 : -7);
  const [hovered, setHovered] = useState<number | null>(null);
  const maximum = Math.max(1, ...points.map((point) => point.value));
  const activePoint = hovered === null ? null : points[hovered];

  return (
    <div className={large ? "metric-card-chart-large" : "metric-card-chart-mini"}>
      <div className="metric-card-chart-bars" aria-label={`${metric.name} timeline`}>
        {points.map((point, index) => (
          <button
            type="button"
            key={`${point.date}-${index}`}
            className={`metric-card-chart-bar ${point.estimated ? "estimated" : ""}`}
            style={{
              height: `${Math.max(point.value === 0 ? 2 : 8, (point.value / maximum) * 100)}%`,
              backgroundColor: metric.color,
            }}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            aria-label={`${formatPointDate(point.date)}: ${formatMetricValue(point.value, metric.percentage)}`}
          />
        ))}
      </div>
      {activePoint ? (
        <div className="metric-card-chart-tooltip" role="status">
          <span>{formatPointDate(activePoint.date)}</span>
          <strong>{formatMetricValue(activePoint.value, metric.percentage)}</strong>
        </div>
      ) : null}
      {large ? (
        <div className="metric-card-chart-axis" aria-hidden="true">
          <span>{points[0] ? formatPointDate(points[0].date) : ""}</span>
          <span>Last 30 days</span>
          <span>{points.at(-1) ? formatPointDate(points.at(-1)!.date) : ""}</span>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardMetricCards({
  metrics,
  dashboard,
  range,
  timezone,
}: {
  metrics: DashboardMetricCardData[];
  dashboard: MetricCardDashboard;
  range: DatePreset;
  timezone: string;
}) {
  const initialOrder = useMemo(() => {
    const saved = (dashboard?.cards ?? [])
      .filter((card) => card.cardType === "kpi")
      .sort((left, right) => left.position - right.position)
      .flatMap(
        (card) => metrics.find((metric) => metric.versionId === card.metricVersionId)?.id ?? [],
      );
    return [...saved, ...metrics.map((metric) => metric.id).filter((id) => !saved.includes(id))];
  }, [dashboard, metrics]);
  const initialSizes = useMemo(
    () =>
      Object.fromEntries(
        metrics.map((metric) => {
          const saved = dashboard?.cards.find(
            (card) => card.cardType === "kpi" && card.metricVersionId === metric.versionId,
          );
          return [
            metric.id,
            metric.hasTimeline && saved?.configuration.size === "large" ? "large" : "standard",
          ];
        }),
      ) as Record<string, CardSize>,
    [dashboard, metrics],
  );
  const [dashboardId, setDashboardId] = useState(dashboard?.id ?? null);
  const [order, setOrder] = useState(initialOrder);
  const [sizes, setSizes] = useState<Record<string, CardSize>>(initialSizes);
  const [customizing, setCustomizing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderedMetrics = order.flatMap((id) => {
    const metric = metrics.find((item) => item.id === id);
    return metric ? [metric] : [];
  });

  function moveMetric(id: string, direction: -1 | 1) {
    setOrder((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
    setSaved(false);
  }

  function moveBefore(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setOrder((current) => {
      const next = current.filter((id) => id !== draggingId);
      next.splice(next.indexOf(targetId), 0, draggingId);
      return next;
    });
    setDraggingId(null);
    setSaved(false);
  }

  function cancelCustomization() {
    setOrder(initialOrder);
    setSizes(initialSizes);
    setCustomizing(false);
    setSaved(false);
    setError(null);
  }

  async function saveDashboard() {
    setSaving(true);
    setError(null);
    try {
      const cards = order.flatMap((id) => {
        const metric = metrics.find((item) => item.id === id);
        if (!metric) return [];
        return [
          {
            metricVersionId: metric.versionId,
            cardType: "kpi" as const,
            title: metric.name,
            configuration: {
              size: metric.hasTimeline ? (sizes[id] ?? "standard") : "standard",
            },
          },
        ];
      });
      const response = await fetch(
        dashboardId ? `/api/dashboards/${dashboardId}` : "/api/dashboards",
        {
          method: dashboardId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dashboard?.name ?? "Main dashboard",
            description: dashboard?.description ?? "Published business metrics",
            timezone,
            defaultDateRange: range,
            cards,
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(result.error?.message ?? "The dashboard layout could not be saved.");
      }
      if (result.data?.id) setDashboardId(result.data.id);
      setSaved(true);
      setCustomizing(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The dashboard layout could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!metrics.length) {
    return (
      <section className="dashboard-metric-section">
        <div className="dashboard-metric-section-heading">
          <div>
            <p className="section-kicker">Published metrics</p>
            <h2>Your live metrics</h2>
          </div>
        </div>
        <div className="dashboard-metric-empty shell-card">
          <LayoutGrid size={22} />
          <h3>No metric cards yet</h3>
          <p>Build a metric and its live value will appear here automatically.</p>
          <Link href="/metrics/new" className="primary-link">
            Build the first metric
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-metric-section" aria-label="Published metric cards">
      <div className="dashboard-metric-section-heading">
        <div>
          <p className="section-kicker">Published metrics</p>
          <h2>Your live metrics</h2>
          <p>Drag to rearrange. Timeline metrics can expand into a 30-day view.</p>
        </div>
        <div className="dashboard-metric-actions">
          {saved ? (
            <span className="dashboard-save-state">
              <Check size={13} /> Saved
            </span>
          ) : null}
          {customizing ? (
            <>
              <button type="button" className="secondary-link" onClick={cancelCustomization}>
                <X size={14} /> Cancel
              </button>
              <button
                type="button"
                className="primary-link"
                disabled={saving}
                onClick={() => void saveDashboard()}
              >
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? "Saving…" : "Save layout"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-link"
              onClick={() => {
                setCustomizing(true);
                setSaved(false);
                setError(null);
              }}
            >
              <Settings2 size={14} /> Customize cards
            </button>
          )}
        </div>
      </div>

      {error ? <p className="dashboard-card-error">{error}</p> : null}
      <div className="dashboard-metric-grid">
        {orderedMetrics.map((metric, index) => {
          const large = metric.hasTimeline && sizes[metric.id] === "large";
          return (
            <article
              key={metric.id}
              className={`dashboard-metric-card shell-card ${large ? "dashboard-metric-card-large" : ""} ${customizing ? "dashboard-metric-card-editing" : ""}`}
              draggable={customizing}
              onDragStart={() => setDraggingId(metric.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveBefore(metric.id)}
            >
              {customizing ? (
                <div className="dashboard-metric-card-controls">
                  <span className="dashboard-drag-handle" title="Drag to rearrange">
                    <GripVertical size={15} />
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveMetric(metric.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${metric.name} left`}
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveMetric(metric.id, 1)}
                    disabled={index === orderedMetrics.length - 1}
                    aria-label={`Move ${metric.name} right`}
                  >
                    <ArrowRight size={14} />
                  </button>
                  {metric.hasTimeline ? (
                    <button
                      type="button"
                      className="dashboard-size-button"
                      onClick={() => {
                        setSizes((current) => ({
                          ...current,
                          [metric.id]: large ? "standard" : "large",
                        }));
                        setSaved(false);
                      }}
                    >
                      {large ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      {large ? "Standard" : "Large 30-day card"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="dashboard-metric-card-content">
                <div className="dashboard-metric-card-copy">
                  <div className="dashboard-metric-card-labels">
                    <span>{metric.category}</span>
                    {metric.hasTimeline ? <small>{large ? "30 days" : "7 days"}</small> : null}
                  </div>
                  <Link href={`/metrics/${metric.slug}`} className="dashboard-metric-name">
                    {metric.name}
                  </Link>
                  <strong className="dashboard-metric-value">
                    {metric.error
                      ? "Unavailable"
                      : formatMetricValue(metric.value, metric.percentage)}
                  </strong>
                  <p className="dashboard-metric-source">{metric.sourceLabel}</p>
                  <div className="dashboard-metric-comparison">
                    {metric.changePercent === null ? (
                      <span>No prior comparison</span>
                    ) : (
                      <span className={metric.changePercent >= 0 ? "positive" : "negative"}>
                        {metric.changePercent >= 0 ? "+" : ""}
                        {metric.changePercent.toFixed(1)}% vs prior period
                      </span>
                    )}
                  </div>
                </div>
                {metric.hasTimeline && metric.points.length ? (
                  <TrendBars metric={metric} large={large} />
                ) : (
                  <div className="dashboard-metric-no-timeline">
                    <span>Live value</span>
                    <small>Add a record date to unlock a timeline</small>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
