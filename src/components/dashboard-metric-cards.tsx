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
import { useId, useMemo, useState } from "react";

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
  goal: number | null;
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

function formatPointDate(value: string, range: DatePreset, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat(
    undefined,
    range === "today" || range === "yesterday"
      ? { timeZone: timezone, hour: "numeric" }
      : { timeZone: timezone, month: "short", day: "numeric" },
  ).format(date);
}

function rangeChartLabel(range: DatePreset): string {
  if (range === "today") return "Today";
  if (range === "yesterday") return "Yesterday";
  if (range === "last_7_days") return "Last 7 days";
  if (range === "last_30_days") return "Last 30 days";
  if (range === "this_month") return "This month";
  return "This quarter";
}

function metricFooterText(metric: DashboardMetricCardData): string {
  if (metric.goal !== null) {
    if (metric.value === null) return `Goal ${formatMetricValue(metric.goal, metric.percentage)}`;
    if (metric.goal === 0) return `Goal ${formatMetricValue(metric.goal, metric.percentage)}`;
    const progress = Math.max(0, (metric.value / metric.goal) * 100);
    return `${progress.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of ${formatMetricValue(metric.goal, metric.percentage)} goal`;
  }
  if (metric.changePercent !== null) {
    return `${metric.changePercent >= 0 ? "+" : ""}${metric.changePercent.toFixed(1)}% vs prior period`;
  }
  return metric.category;
}

function TrendBars({
  metric,
  large,
  range,
  timezone,
}: {
  metric: DashboardMetricCardData;
  large: boolean;
  range: DatePreset;
  timezone: string;
}) {
  const points = metric.points;
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");
  const maximum = Math.max(1, ...points.map((point) => point.value));
  const activePoint = hovered === null ? null : points[hovered];
  const activeLeft =
    hovered === null || !points.length ? 50 : ((hovered + 0.5) / points.length) * 100;

  if (!large) {
    const coordinates = points.map((point, index) => ({
      x: points.length <= 1 ? 50 : (index / (points.length - 1)) * 100,
      y: 36 - (point.value / maximum) * 31,
    }));
    const linePath = coordinates
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");
    const areaPath = coordinates.length
      ? `${linePath} L${coordinates.at(-1)!.x},40 L${coordinates[0]!.x},40 Z`
      : "";
    return (
      <div
        className="metric-card-chart-mini metric-card-sparkline"
        role="group"
        aria-label={`${metric.name} timeline`}
      >
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={metric.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={metric.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={metric.color}
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="metric-card-sparkline-points">
          {coordinates.map((point, index) => (
            <button
              type="button"
              key={`${metric.points[index]?.date}-${index}`}
              style={{ left: `${point.x}%`, top: `${(point.y / 40) * 100}%` }}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              onClick={() => setHovered(index)}
              aria-label={`${formatPointDate(metric.points[index]!.date, range, timezone)}: ${formatMetricValue(metric.points[index]!.value, metric.percentage)}`}
            />
          ))}
        </div>
        {activePoint ? (
          <div
            className="metric-card-chart-tooltip"
            role="status"
            style={{ left: `clamp(52px, ${activeLeft}%, calc(100% - 52px))` }}
          >
            <span>{formatPointDate(activePoint.date, range, timezone)}</span>
            <strong>{formatMetricValue(activePoint.value, metric.percentage)}</strong>
          </div>
        ) : null}
      </div>
    );
  }

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
            onClick={() => setHovered(index)}
            aria-label={`${formatPointDate(point.date, range, timezone)}: ${formatMetricValue(point.value, metric.percentage)}`}
          />
        ))}
      </div>
      {activePoint ? (
        <div
          className="metric-card-chart-tooltip"
          role="status"
          style={{ left: `clamp(52px, ${activeLeft}%, calc(100% - 52px))` }}
        >
          <span>{formatPointDate(activePoint.date, range, timezone)}</span>
          <strong>{formatMetricValue(activePoint.value, metric.percentage)}</strong>
        </div>
      ) : null}
      {large ? (
        <div className="metric-card-chart-axis" aria-hidden="true">
          <span>{points[0] ? formatPointDate(points[0].date, range, timezone) : ""}</span>
          <span>{rangeChartLabel(range)}</span>
          <span>{points.at(-1) ? formatPointDate(points.at(-1)!.date, range, timezone) : ""}</span>
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
          <h2>Your live metrics</h2>
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
        <h2>Your live metrics</h2>
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
                      {large ? "Standard" : "Large chart card"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="dashboard-metric-card-content">
                <div
                  className={`dashboard-metric-card-body ${metric.hasTimeline && metric.points.length ? "has-timeline" : ""}`}
                >
                  <div className="dashboard-metric-card-labels">
                    <Link href={`/metrics/${metric.slug}`} className="dashboard-metric-name">
                      {metric.name}
                    </Link>
                    {metric.hasTimeline ? <small>{rangeChartLabel(range)}</small> : null}
                  </div>
                  <div className="dashboard-metric-card-copy">
                    <strong className="dashboard-metric-value">
                      {metric.error
                        ? "Unavailable"
                        : formatMetricValue(metric.value, metric.percentage)}
                    </strong>
                    <p className="dashboard-metric-source">{metric.sourceLabel}</p>
                  </div>
                  {metric.hasTimeline && metric.points.length ? (
                    <TrendBars metric={metric} large={large} range={range} timezone={timezone} />
                  ) : null}
                </div>
                <div className="dashboard-metric-card-footer">
                  <span style={{ backgroundColor: metric.color }} aria-hidden="true" />
                  <p>{metricFooterText(metric)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
