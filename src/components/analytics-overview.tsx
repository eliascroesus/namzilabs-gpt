import { and, count, eq, gte, isNull, lt } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { DashboardDataCards } from "@/components/dashboard-data-cards";
import { DashboardRangeSelector } from "@/components/dashboard-range-selector";
import { RefreshAllButton } from "@/components/refresh-all-button";
import { getDb } from "@/db/client";
import { connections, deadLetterEvents, metrics, organizations, sourceRecords } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";
import { dateRangeForPreset, type DatePreset } from "@/server/metrics/time";

function rangeLabel(range: DatePreset): string {
  if (range === "today") return "Today’s";
  if (range === "yesterday") return "Yesterday’s";
  if (range === "last_7_days") return "7-day";
  return "30-day";
}

export async function AnalyticsOverview({
  title = "Analytics",
  range,
}: {
  title?: string;
  range?: DatePreset;
}) {
  const tenant = await requireTenantContext();
  const db = getDb();
  const [[organization], connectionRows, totalRows, deadLetterRows, metricRows] = await Promise.all(
    [
      db
        .select({ timezone: organizations.timezone })
        .from(organizations)
        .where(eq(organizations.id, tenant.organizationId))
        .limit(1),
      db
        .select({ status: connections.status })
        .from(connections)
        .where(eq(connections.organizationId, tenant.organizationId)),
      db
        .select({ value: count() })
        .from(sourceRecords)
        .where(
          and(
            eq(sourceRecords.organizationId, tenant.organizationId),
            eq(sourceRecords.isDeleted, false),
          ),
        ),
      db
        .select({ value: count() })
        .from(deadLetterEvents)
        .where(eq(deadLetterEvents.organizationId, tenant.organizationId)),
      db
        .select({ currentPublishedVersion: metrics.currentPublishedVersion })
        .from(metrics)
        .where(and(eq(metrics.organizationId, tenant.organizationId), isNull(metrics.archivedAt))),
    ],
  );

  const effectiveRange = range ?? "last_30_days";
  const timezone = organization?.timezone ?? "UTC";
  const window = dateRangeForPreset(effectiveRange, timezone);
  const activityRows = await db
    .select({ value: count() })
    .from(sourceRecords)
    .where(
      and(
        eq(sourceRecords.organizationId, tenant.organizationId),
        eq(sourceRecords.isDeleted, false),
        gte(sourceRecords.occurredAt, window.start),
        lt(sourceRecords.occurredAt, window.end),
      ),
    );

  const activeConnections = connectionRows.filter((connection) => connection.status === "active");
  const delayedConnections = connectionRows.filter((connection) => connection.status !== "active");
  const publishedMetricCount = metricRows.filter(
    (metric) => metric.currentPublishedVersion !== null,
  ).length;

  return (
    <div className="dashboard-summary-page mx-auto max-w-[1500px]">
      <div className="dashboard-page-header">
        <h1>{title}</h1>
        <div className="dashboard-header-actions">
          <DashboardRangeSelector range={effectiveRange} />
          <RefreshAllButton />
          <Link href="/metrics/new" className="primary-link">
            <Plus size={15} /> Build metric
          </Link>
        </div>
      </div>

      <DashboardDataCards
        activeSources={activeConnections.length}
        connectedSources={connectionRows.length}
        unifiedRecords={Number(totalRows[0]?.value ?? 0)}
        periodRecords={Number(activityRows[0]?.value ?? 0)}
        publishedMetrics={publishedMetricCount}
        pipelineIssues={Number(deadLetterRows[0]?.value ?? 0) + delayedConnections.length}
        periodLabel={rangeLabel(effectiveRange)}
      />
    </div>
  );
}
