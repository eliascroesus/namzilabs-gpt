import { AlertTriangle, Database, Gauge, Radio, type LucideIcon } from "lucide-react";

type DashboardDataCardsProps = {
  activeSources: number;
  connectedSources: number;
  unifiedRecords: number;
  periodRecords: number;
  pipelineIssues: number;
  periodLabel: string;
};

export function DashboardDataCards({
  activeSources,
  connectedSources,
  unifiedRecords,
  periodRecords,
  pipelineIssues,
  periodLabel,
}: DashboardDataCardsProps) {
  const cards: [string, number, string, LucideIcon][] = [
    ["Active sources", activeSources, `${connectedSources} connected`, Gauge],
    ["Unified records", unifiedRecords, "Available for metrics", Database],
    [`${periodLabel} records`, periodRecords, "Available in this period", Radio],
    [
      "Pipeline issues",
      pipelineIssues,
      pipelineIssues ? "Need attention" : "All systems clear",
      AlertTriangle,
    ],
  ];

  return (
    <section aria-label="Data overview" className="dashboard-data-card-grid mt-7">
      {cards.map(([label, value, detail, Icon]) => (
        <article className="summary-stat-card shell-card" key={label}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
            <span className="summary-stat-icon">
              <Icon size={15} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
            {value.toLocaleString()}
          </p>
          <p className="mt-2 text-[11px] text-[var(--muted)]">{detail}</p>
        </article>
      ))}
    </section>
  );
}
