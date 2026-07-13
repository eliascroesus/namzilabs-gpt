"use client";

import { BarChart3, ChartPie, LineChart } from "lucide-react";
import { useMemo, useState } from "react";

export type MetricVisualization = {
  id: string;
  name: string;
  sourceLabel: string;
  value: number | null;
  percentage: boolean;
  trendEligible: boolean;
  preferred: "kpi" | "trend" | "pie";
  color: string;
  points: { date: string; value: number }[];
};

function formatValue(value: number | null, percentage = false): string {
  if (value === null) return "—";
  const label = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return percentage ? `${label}%` : label;
}

function TrendGraphic({
  points,
  chartType,
  color,
}: {
  points: { date: string; value: number }[];
  chartType: "line" | "bar";
  color: string;
}) {
  const width = 900;
  const height = 240;
  const paddingX = 30;
  const paddingTop = 18;
  const paddingBottom = 34;
  const maximum = Math.max(1, ...points.map((point) => point.value));
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingTop - paddingBottom;
  const coordinates = points.map((point, index) => ({
    x: paddingX + (index / Math.max(1, points.length - 1)) * usableWidth,
    y: paddingTop + usableHeight - (point.value / maximum) * usableHeight,
  }));
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = coordinates.length
    ? `${paddingX},${paddingTop + usableHeight} ${polyline} ${width - paddingX},${paddingTop + usableHeight}`
    : "";
  const barWidth = Math.max(4, usableWidth / Math.max(1, points.length) - 6);
  return (
    <div className="mt-5 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Thirty day metric trend"
        className="h-[240px] min-w-[680px] w-full"
      >
        <defs>
          <linearGradient id="metric-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + usableHeight * ratio;
          return (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="#252b36"
              strokeDasharray="3 6"
            />
          );
        })}
        {chartType === "line" ? (
          <>
            {area ? <polygon points={area} fill="url(#metric-trend-fill)" /> : null}
            <polyline
              points={polyline}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          coordinates.map((point, index) => {
            const value = points[index]?.value ?? 0;
            const baseline = paddingTop + usableHeight;
            return (
              <rect
                key={points[index]?.date}
                x={point.x - barWidth / 2}
                y={point.y}
                width={barWidth}
                height={Math.max(1, baseline - point.y)}
                rx="4"
                fill={color}
                opacity={value ? 0.88 : 0.18}
              />
            );
          })
        )}
        {[0, 7, 14, 21, 29].map((index) => {
          const coordinate = coordinates[index];
          const point = points[index];
          if (!coordinate || !point) return null;
          return (
            <text
              key={point.date}
              x={coordinate.x}
              y={height - 8}
              textAnchor={index === 0 ? "start" : index === 29 ? "end" : "middle"}
              fill="#778195"
              fontSize="11"
            >
              {new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function MetricVisualizations({ metrics }: { metrics: MetricVisualization[] }) {
  const trendMetrics = useMemo(() => metrics.filter((metric) => metric.trendEligible), [metrics]);
  const pieMetrics = useMemo(
    () => metrics.filter((metric) => metric.value !== null && (metric.value ?? 0) >= 0),
    [metrics],
  );
  const defaultTrend =
    trendMetrics.find((metric) => metric.preferred === "trend") ?? trendMetrics[0];
  const defaultPie = pieMetrics
    .filter((metric) => metric.preferred === "pie")
    .map((metric) => metric.id);
  const [trendMetricId, setTrendMetricId] = useState(defaultTrend?.id ?? "");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [pieMetricIds, setPieMetricIds] = useState<string[]>(
    defaultPie.length >= 2
      ? defaultPie.slice(0, 6)
      : pieMetrics.slice(0, 3).map((metric) => metric.id),
  );

  const selectedTrend = trendMetrics.find((metric) => metric.id === trendMetricId) ?? defaultTrend;
  const selectedPie = pieMetricIds.flatMap((id) => {
    const metric = pieMetrics.find((item) => item.id === id);
    return metric ? [metric] : [];
  });
  const pieTotal = selectedPie.reduce((total, metric) => total + (metric.value ?? 0), 0);
  let pieCursor = 0;
  const pieGradient = selectedPie.length
    ? `conic-gradient(${selectedPie
        .map((metric) => {
          const start = pieTotal ? (pieCursor / pieTotal) * 100 : 0;
          pieCursor += metric.value ?? 0;
          const end = pieTotal ? (pieCursor / pieTotal) * 100 : 0;
          return `${metric.color} ${start}% ${end}%`;
        })
        .join(", ")})`
    : "conic-gradient(#252b36 0 100%)";

  function chooseTrend(id: string) {
    setTrendMetricId(id);
  }
  function togglePie(id: string) {
    setPieMetricIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 6
          ? [...current, id]
          : current;
      return next;
    });
  }

  return (
    <section className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,.8fr)]">
      <article className="shell-card overflow-hidden p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <LineChart size={16} className="text-[var(--accent)]" />
              <h2 className="text-base font-semibold">Metric trend</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Choose any non-ratio metric. Percentages and derived ratios are intentionally
              excluded.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="field-control min-w-52"
              value={selectedTrend?.id ?? ""}
              onChange={(event) => chooseTrend(event.target.value)}
              aria-label="Metric shown on trend graph"
            >
              {trendMetrics.length ? null : <option value="">No eligible metrics</option>}
              {trendMetrics.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.name}
                </option>
              ))}
            </select>
            <div className="chart-type-toggle" aria-label="Chart type">
              <button
                type="button"
                className={chartType === "line" ? "active" : ""}
                onClick={() => setChartType("line")}
                aria-label="Line chart"
              >
                <LineChart size={15} />
              </button>
              <button
                type="button"
                className={chartType === "bar" ? "active" : ""}
                onClick={() => setChartType("bar")}
                aria-label="Bar chart"
              >
                <BarChart3 size={15} />
              </button>
            </div>
          </div>
        </div>
        {selectedTrend ? (
          <>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#b8c0ce]">{selectedTrend.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{selectedTrend.sourceLabel}</p>
              </div>
              <p className="text-3xl font-semibold">{formatValue(selectedTrend.value)}</p>
            </div>
            <TrendGraphic
              points={selectedTrend.points}
              chartType={chartType}
              color={selectedTrend.color}
            />
          </>
        ) : (
          <div className="grid min-h-64 place-items-center text-center text-sm text-[var(--muted)]">
            Build a count, unique count, sum, or average metric to unlock a trend graph.
          </div>
        )}
      </article>

      <article className="shell-card p-5">
        <div className="flex items-center gap-2">
          <ChartPie size={16} className="text-[var(--accent)]" />
          <h2 className="text-base font-semibold">Metric mix</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Select up to six metrics—even when they come from different integrations.
        </p>
        <div className="mt-5 grid place-items-center">
          <div className="metric-donut" style={{ background: pieGradient }}>
            <div>
              <strong>{formatValue(pieTotal)}</strong>
              <span>combined</span>
            </div>
          </div>
        </div>
        <div className="mt-5 max-h-64 space-y-2 overflow-y-auto pr-1">
          {pieMetrics.length ? (
            pieMetrics.map((metric) => {
              const checked = pieMetricIds.includes(metric.id);
              const share = pieTotal && checked ? ((metric.value ?? 0) / pieTotal) * 100 : 0;
              return (
                <label
                  key={metric.id}
                  className={`pie-metric-row ${checked ? "pie-metric-row-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePie(metric.id)}
                    disabled={!checked && pieMetricIds.length >= 6}
                  />
                  <span className="size-2.5 rounded-full" style={{ background: metric.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{metric.name}</span>
                    <span className="block truncate text-[10px] text-[var(--muted)]">
                      {metric.sourceLabel}
                    </span>
                  </span>
                  <span className="text-right text-xs font-semibold">
                    {formatValue(metric.value, metric.percentage)}
                    {checked && pieTotal ? (
                      <small className="block font-normal text-[var(--muted)]">
                        {share.toFixed(1)}%
                      </small>
                    ) : null}
                  </span>
                </label>
              );
            })
          ) : (
            <p className="py-8 text-center text-xs text-[var(--muted)]">No numeric metrics yet.</p>
          )}
        </div>
      </article>
    </section>
  );
}
