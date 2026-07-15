type DashboardDataCardsProps = {
  activeSources: number;
  connectedSources: number;
  unifiedRecords: number;
  periodRecords: number;
  publishedMetrics: number;
  pipelineIssues: number;
  periodLabel: string;
};

export function DashboardDataCards({
  activeSources,
  connectedSources,
  unifiedRecords,
  periodRecords,
  publishedMetrics,
  pipelineIssues,
  periodLabel,
}: DashboardDataCardsProps) {
  const cards: [string, number, string, string][] = [
    ["Active sources", activeSources, `${connectedSources} connected`, "Live connections"],
    ["Unified records", unifiedRecords, "Available for metrics", "All synchronized data"],
    [`${periodLabel} records`, periodRecords, "In the selected period", "Reporting activity"],
    ["Published metrics", publishedMetrics, "Ready for dashboards", "Live definitions"],
    [
      "Pipeline issues",
      pipelineIssues,
      pipelineIssues ? "Needs attention" : "All systems clear",
      pipelineIssues ? "Review data sources" : "Healthy pipelines",
    ],
  ];

  return (
    <section aria-label="Data overview" className="dashboard-data-card-grid mt-7">
      {cards.map(([label, value, detail, context]) => (
        <article className="summary-stat-card shell-card" key={label}>
          <div className="summary-stat-card-body">
            <p className="summary-stat-label">{label}</p>
            <p className="summary-stat-value">{value.toLocaleString()}</p>
            <p className="summary-stat-context">{context}</p>
          </div>
          <div className="summary-stat-card-footer">
            <span
              className={pipelineIssues && label === "Pipeline issues" ? "warning" : "healthy"}
            />
            <p>{detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
