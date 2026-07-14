import { ArrowUp } from "lucide-react";

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
  const cards: [string, number, string][] = [
    ["Active sources", activeSources, `${connectedSources} connected`],
    ["Unified records", unifiedRecords, "Available for metrics"],
    [`${periodLabel} records`, periodRecords, "Available in this period"],
    ["Pipeline issues", pipelineIssues, pipelineIssues ? "Need attention" : "All systems clear"],
  ];

  return (
    <section aria-label="Data overview" className="dashboard-data-card-grid mt-7">
      {cards.map(([label, value, detail]) => (
        <article className="summary-stat-card shell-card" key={label}>
          <div className="summary-stat-card-body">
            <div className="flex items-start justify-between gap-3">
              <p className="summary-stat-label">{label}</p>
              <span className="summary-stat-spark" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6].map((bar) => (
                  <span key={bar} className={bar === 4 ? "active" : ""} />
                ))}
              </span>
            </div>
            <p className="summary-stat-value">{value.toLocaleString()}</p>
          </div>
          <div className="summary-stat-card-footer">
            <span className="summary-stat-footer-icon" aria-hidden="true">
              <ArrowUp size={9} />
            </span>
            <p>{detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
