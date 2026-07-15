import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { getProviderPresentation } from "@/lib/provider-presentation";

export type DashboardSourceCardData = {
  id: string;
  provider: string;
  name: string;
  status: string;
  freshness: string;
  records: number;
  periodRecords: number;
  lastSuccessfulSyncAt: Date | null;
};

function syncLabel(value: Date | null): string {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function DashboardSourceCards({ sources }: { sources: DashboardSourceCardData[] }) {
  if (!sources.length) return null;

  return (
    <section className="dashboard-source-section" aria-label="Connected data sources">
      <div className="dashboard-source-heading">
        <h2>Sources</h2>
        <Link href="/integrations" className="text-button">
          Manage sources <ArrowRight size={13} />
        </Link>
      </div>
      <div className="dashboard-source-grid">
        {sources.map((source) => {
          const provider = getProviderPresentation(source.provider);
          const healthy = source.status === "active" && source.freshness !== "delayed";
          const activityWidth = source.records
            ? Math.min(100, Math.max(3, (source.periodRecords / source.records) * 100))
            : 0;
          return (
            <Link
              href={`/integrations/${source.id}`}
              className="dashboard-source-card shell-card"
              key={source.id}
              style={{ "--source-color": provider.color } as CSSProperties}
            >
              <div className="dashboard-source-card-header">
                <span className="dashboard-source-mark">{provider.shortLabel}</span>
                <div>
                  <h3>{provider.label}</h3>
                  <p>{source.name}</p>
                </div>
                <span className={`dashboard-source-health ${healthy ? "healthy" : "attention"}`}>
                  {healthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {healthy ? "Connected" : "Attention"}
                </span>
              </div>
              <dl className="dashboard-source-stats">
                <div>
                  <dt>Records</dt>
                  <dd>{source.records.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Selected period</dt>
                  <dd>{source.periodRecords.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Last sync</dt>
                  <dd>{syncLabel(source.lastSuccessfulSyncAt)}</dd>
                </div>
              </dl>
              <div className="dashboard-source-activity" aria-hidden="true">
                <span style={{ width: `${activityWidth}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
