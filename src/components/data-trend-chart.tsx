export type TrendPoint = { date: string; value: number };

export function DataTrendChart({ points }: { points: TrendPoint[] }) {
  const width = 900;
  const height = 230;
  const paddingX = 28;
  const paddingTop = 20;
  const paddingBottom = 34;
  const maximum = Math.max(1, ...points.map((point) => point.value));
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingTop - paddingBottom;
  const coordinates = points.map((point, index) => ({
    x: paddingX + (index / Math.max(1, points.length - 1)) * usableWidth,
    y: paddingTop + usableHeight - (point.value / maximum) * usableHeight,
  }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = coordinates.length
    ? `${paddingX},${paddingTop + usableHeight} ${line} ${width - paddingX},${paddingTop + usableHeight}`
    : "";
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <section className="shell-card mt-7 overflow-hidden p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Data activity</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Source records available to metrics over the last 30 days.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{total.toLocaleString()}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            records in range
          </p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Thirty day source record trend, ${total} records total`}
          className="h-[230px] min-w-[680px] w-full"
        >
          <defs>
            <linearGradient id="namzi-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7417" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ff7417" stopOpacity="0" />
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
          {area ? <polygon points={area} fill="url(#namzi-trend-fill)" /> : null}
          {line ? (
            <polyline
              points={line}
              fill="none"
              stroke="var(--chart-series-1)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {coordinates.map((point, index) =>
            points[index]?.value ? (
              <circle
                key={points[index]?.date}
                cx={point.x}
                cy={point.y}
                r="3"
                fill="var(--chart-series-1)"
              />
            ) : null,
          )}
          {[0, 7, 14, 21, 29].map((index) => {
            const point = coordinates[index];
            const source = points[index];
            if (!point || !source) return null;
            return (
              <text
                key={source.date}
                x={point.x}
                y={height - 8}
                textAnchor={index === 0 ? "start" : index === 29 ? "end" : "middle"}
                fill="var(--muted)"
                fontSize="11"
              >
                {new Date(`${source.date}T00:00:00Z`).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
