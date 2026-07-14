export default function DashboardLoading() {
  return (
    <div className="dashboard-loading" aria-label="Loading workspace">
      <div className="dashboard-loading-heading" />
      <div className="dashboard-loading-subheading" />
      <div className="dashboard-loading-toolbar" />
      <div className="dashboard-loading-grid">
        <div className="dashboard-loading-chart" />
        <div className="dashboard-loading-stats" />
      </div>
    </div>
  );
}
