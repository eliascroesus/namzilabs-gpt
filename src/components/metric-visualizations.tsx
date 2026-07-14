"use client";

import { BarChart3, ChartPie, Clock3, LineChart } from "lucide-react";
import { useMemo, useState } from "react";

export type MetricPoint = {
  date: string;
  value: number;
  estimated: boolean;
};

export type MetricVisualization = {
  id: string;
  versionId: string;
  name: string;
  category: string;
  sourceLabel: string;
  value: number | null;
  percentage: boolean;
  trendEligible: boolean;
  preferred: "kpi" | "trend" | "pie";
  color: string;
  points: MetricPoint[];
};

export type VisualizationConfiguration = {
  trendMetricId: string;
  chartType: "line" | "bar";
  pieMetricIds: string[];
};

const piePalette = ["#8b5cf6", "#a78bfa", "#6d4aff", "#60a5fa", "#14b8a6", "#8f9094"];

function formatValue(value: number | null, percentage = false): string {
  if (value === null) return "—";
  const label = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return percentage ? `${label}%` : label;
}

function pointLabel(point: MetricPoint, hourly: boolean): string {
  return new Date(point.date).toLocaleString("en", {
    month: "short",
    day: "numeric",
    ...(hourly ? { hour: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function TrendGraphic({
  points,
  chartType,
  color,
  metricName,
}: {
  points: MetricPoint[];
  chartType: "line" | "bar";
  color: string;
  metricName: string;
}) {
  const chartColor = ["#8b5cf6", "#8b7cff", "#7c3aed", "#6f5cff", "#f5741c", "#ff7417"].includes(
    color.toLowerCase(),
  )
    ? "#8b5cf6"
    : color;
  const gradientId = `metric-trend-fill-${chartColor.replace("#", "")}`;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 900;
  const height = 270;
  const paddingX = 42;
  const paddingTop = 24;
  const paddingBottom = 38;
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
  const barWidth = Math.max(5, usableWidth / Math.max(1, points.length) - 7);
  const hourly = points.length <= 24 && points.some((point) => point.date.includes("T"));
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
  const hoveredCoordinate = hoveredIndex === null ? null : coordinates[hoveredIndex];
  const tooltipWidth = 174;
  const tooltipX = hoveredCoordinate
    ? Math.min(width - tooltipWidth - 8, Math.max(8, hoveredCoordinate.x - tooltipWidth / 2))
    : 0;
  const labelIndexes = [
    ...new Set([
      0,
      Math.floor((points.length - 1) / 3),
      Math.floor(((points.length - 1) * 2) / 3),
      points.length - 1,
    ]),
  ];
  const allEstimated = points.length > 0 && points.every((point) => point.estimated);

  return (
    <div className="metric-trend-graphic mt-5 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${metricName} metric trend`}
        className="h-[270px] min-w-[680px] w-full"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={allEstimated ? "#60a5fa" : chartColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
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
              stroke="var(--chart-grid)"
              strokeDasharray="3 6"
            />
          );
        })}
        {chartType === "line" ? (
          <>
            {area ? <polygon points={area} fill={`url(#${gradientId})`} /> : null}
            <polyline
              points={polyline}
              fill="none"
              stroke={allEstimated ? "#60a5fa" : chartColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={allEstimated ? "7 6" : undefined}
            />
          </>
        ) : (
          coordinates.map((point, index) => {
            const item = points[index];
            const baseline = paddingTop + usableHeight;
            return (
              <rect
                key={item?.date}
                x={point.x - barWidth / 2}
                y={point.y}
                width={barWidth}
                height={Math.max(1, baseline - point.y)}
                rx="2"
                fill={item?.estimated ? "#60a5fa" : chartColor}
                opacity={item?.value ? 0.86 : 0.16}
              />
            );
          })
        )}
        {coordinates.map((point, index) => (
          <g key={points[index]?.date}>
            {chartType === "line" && points[index]?.value ? (
              <circle
                cx={point.x}
                cy={point.y}
                r={points[index]?.estimated ? 4 : 3}
                fill={points[index]?.estimated ? "#60a5fa" : chartColor}
                stroke="var(--card)"
                strokeWidth="2"
                opacity={hoveredIndex === index ? 1 : 0.75}
              />
            ) : null}
            <rect
              x={point.x - Math.max(10, barWidth / 2)}
              y={paddingTop}
              width={Math.max(20, barWidth)}
              height={usableHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
            />
          </g>
        ))}
        {labelIndexes.map((index) => {
          const coordinate = coordinates[index];
          const point = points[index];
          if (!coordinate || !point) return null;
          return (
            <text
              key={`label-${point.date}`}
              x={coordinate.x}
              y={height - 10}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              fill="var(--muted)"
              fontSize="11"
            >
              {pointLabel(point, hourly)}
            </text>
          );
        })}
        {hoveredPoint && hoveredCoordinate ? (
          <g pointerEvents="none">
            <line
              x1={hoveredCoordinate.x}
              x2={hoveredCoordinate.x}
              y1={paddingTop}
              y2={paddingTop + usableHeight}
              stroke={hoveredPoint.estimated ? "#60a5fa" : chartColor}
              strokeDasharray="3 4"
              opacity="0.65"
            />
            <rect
              x={tooltipX}
              y="8"
              width={tooltipWidth}
              height={hoveredPoint.estimated ? 62 : 48}
              rx="9"
              fill="var(--surface-3)"
              opacity="0.96"
            />
            <text x={tooltipX + 12} y="27" fill="var(--foreground)" fontSize="11" fontWeight="650">
              {pointLabel(hoveredPoint, hourly)}
            </text>
            <text x={tooltipX + 12} y="43" fill="var(--muted)" fontSize="11">
              {metricName}: {formatValue(hoveredPoint.value)}
            </text>
            {hoveredPoint.estimated ? (
              <text x={tooltipX + 12} y="57" fill="#60a5fa" fontSize="9" fontWeight="700">
                ESTIMATED TIMESTAMP
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function MetricVisualizations({
  metrics,
  configuration,
  onConfigurationChange,
  showTrend = true,
  showPie = true,
  editable = false,
}: {
  metrics: MetricVisualization[];
  configuration: VisualizationConfiguration;
  onConfigurationChange: (configuration: VisualizationConfiguration) => void;
  showTrend?: boolean;
  showPie?: boolean;
  editable?: boolean;
}) {
  const trendMetrics = useMemo(() => metrics.filter((metric) => metric.trendEligible), [metrics]);
  const pieMetrics = useMemo(
    () =>
      metrics.filter(
        (metric) => !metric.percentage && metric.value !== null && (metric.value ?? 0) >= 0,
      ),
    [metrics],
  );
  const defaultTrend =
    trendMetrics.find((metric) => metric.preferred === "trend") ?? trendMetrics[0];
  const selectedTrend =
    trendMetrics.find((metric) => metric.id === configuration.trendMetricId) ?? defaultTrend;
  const selectedPie = configuration.pieMetricIds.flatMap((id) => {
    const metric = pieMetrics.find((item) => item.id === id);
    return metric ? [metric] : [];
  });
  const effectivePie = selectedPie.length
    ? selectedPie
    : pieMetrics.filter((metric) => metric.preferred === "pie").slice(0, 6);
  const listedPieMetrics = editable ? pieMetrics : effectivePie;
  const pieTotal = effectivePie.reduce((total, metric) => total + (metric.value ?? 0), 0);
  let pieCursor = 0;
  const pieGradient = effectivePie.length
    ? `conic-gradient(${effectivePie
        .map((metric, index) => {
          const start = pieTotal ? (pieCursor / pieTotal) * 100 : 0;
          pieCursor += metric.value ?? 0;
          const end = pieTotal ? (pieCursor / pieTotal) * 100 : 0;
          return `${piePalette[index % piePalette.length]} ${start}% ${end}%`;
        })
        .join(", ")})`
    : "conic-gradient(var(--surface-3) 0 100%)";

  function togglePie(id: string) {
    const activeIds = effectivePie.map((metric) => metric.id);
    const next = activeIds.includes(id)
      ? activeIds.filter((item) => item !== id)
      : activeIds.length < 6
        ? [...activeIds, id]
        : activeIds;
    onConfigurationChange({ ...configuration, pieMetricIds: next });
  }

  if (!showTrend && !showPie) return null;

  return (
    <section
      className={`metric-visualization-grid ${showTrend && showPie ? "xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,.75fr)]" : "grid-cols-1"}`}
    >
      {showTrend ? (
        <article className="metric-trend-panel shell-card overflow-hidden p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <LineChart size={16} className="text-[var(--accent)]" />
                <h2 className="text-base font-semibold">Metric trend</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Hover any point for the exact value.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="field-control min-w-52"
                value={selectedTrend?.id ?? ""}
                onChange={(event) =>
                  onConfigurationChange({
                    ...configuration,
                    trendMetricId: event.target.value,
                  })
                }
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
                {(["line", "bar"] as const).map((type) => {
                  const Icon = type === "line" ? LineChart : BarChart3;
                  return (
                    <button
                      key={type}
                      type="button"
                      className={configuration.chartType === type ? "active" : ""}
                      onClick={() => onConfigurationChange({ ...configuration, chartType: type })}
                      aria-label={`${type === "line" ? "Line" : "Bar"} chart`}
                    >
                      <Icon size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {selectedTrend ? (
            <>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {selectedTrend.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{selectedTrend.sourceLabel}</p>
                </div>
                <p className="text-3xl font-semibold">{formatValue(selectedTrend.value)}</p>
              </div>
              {selectedTrend.points.some((point) => point.estimated) ? (
                <div className="estimated-time-note mt-4">
                  <Clock3 size={13} /> Dashed blue data uses sync time because no reliable source
                  timestamp was selected.
                </div>
              ) : null}
              <TrendGraphic
                points={selectedTrend.points}
                chartType={configuration.chartType}
                color={selectedTrend.color}
                metricName={selectedTrend.name}
              />
            </>
          ) : (
            <div className="grid min-h-64 place-items-center text-center text-sm text-[var(--muted)]">
              Build a count, unique count, sum, or average metric to unlock a trend graph.
            </div>
          )}
        </article>
      ) : null}

      {showPie ? (
        <article className="metric-pie-panel shell-card p-5">
          <div className="flex items-center gap-2">
            <ChartPie size={16} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold">Metric mix</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Number-based metrics only. Ratios stay out of this comparison.
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
            {listedPieMetrics.length ? (
              listedPieMetrics.map((metric) => {
                const selectedIndex = effectivePie.findIndex((item) => item.id === metric.id);
                const checked = selectedIndex >= 0;
                const share = pieTotal && checked ? ((metric.value ?? 0) / pieTotal) * 100 : 0;
                return (
                  <div
                    key={metric.id}
                    className={`pie-metric-row ${checked ? "pie-metric-row-active" : ""}`}
                  >
                    {editable ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePie(metric.id)}
                        disabled={!checked && effectivePie.length >= 6}
                        aria-label={`Include ${metric.name} in metric mix`}
                      />
                    ) : null}
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        background: checked
                          ? piePalette[selectedIndex % piePalette.length]
                          : "var(--line-strong)",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{metric.name}</span>
                      <span className="block truncate text-[10px] text-[var(--muted)]">
                        {metric.category} · {metric.sourceLabel}
                      </span>
                    </span>
                    <span className="text-right text-xs font-semibold">
                      {formatValue(metric.value)}
                      {checked && pieTotal ? (
                        <small className="block font-normal text-[var(--muted)]">
                          {share.toFixed(1)}%
                        </small>
                      ) : null}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-xs text-[var(--muted)]">
                Build a number-based metric to create a pie chart.
              </p>
            )}
          </div>
        </article>
      ) : null}
    </section>
  );
}
