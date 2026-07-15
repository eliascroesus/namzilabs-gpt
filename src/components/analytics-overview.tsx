import { and, asc, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { DashboardDataCards } from "@/components/dashboard-data-cards";
import {
  DashboardMetricCards,
  type DashboardMetricCardData,
  type MetricCardDashboard,
} from "@/components/dashboard-metric-cards";
import { DashboardRangeSelector } from "@/components/dashboard-range-selector";
import { RefreshAllButton } from "@/components/refresh-all-button";
import { getDb } from "@/db/client";
import {
  connectionResources,
  connections,
  dashboardCards,
  dashboards,
  deadLetterEvents,
  metrics,
  metricVersions,
  organizations,
  sourceRecords,
} from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";
import { parseMetricDefinition, type MetricDefinition } from "@/server/metrics/dsl";
import { executeDefinitionSeries, executeSavedMetricVersion } from "@/server/metrics/service";
import { dateRangeForPreset, type DatePreset } from "@/server/metrics/time";

function rangeLabel(range: DatePreset): string {
  if (range === "today") return "Today’s";
  if (range === "yesterday") return "Yesterday’s";
  if (range === "last_7_days") return "7-day";
  return "30-day";
}

function isPercentageMetric(definition: MetricDefinition): boolean {
  return (
    definition.measure.operation === "percentage" ||
    (definition.measure.operation === "ratio" && definition.measure.asPercentage)
  );
}

function sourceLabel(definition: MetricDefinition): string {
  if (!definition.source) return "Combined metrics";
  return (
    [definition.source.spreadsheetName, definition.source.sheetName].filter(Boolean).join(" / ") ||
    definition.source.provider.replaceAll("-", " ")
  );
}

function wallClockKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function rowBucketKey(value: unknown): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
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
  const [
    [organization],
    [dashboardRow],
    connectionRows,
    totalRows,
    deadLetterRows,
    metricRows,
    resourceRows,
  ] = await Promise.all([
    db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, tenant.organizationId))
      .limit(1),
    db
      .select()
      .from(dashboards)
      .where(eq(dashboards.organizationId, tenant.organizationId))
      .orderBy(desc(dashboards.updatedAt))
      .limit(1),
    db
      .select({ status: connections.status, freshness: connections.freshness })
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
      .select({
        id: metrics.id,
        name: metrics.name,
        slug: metrics.slug,
        versionId: metricVersions.id,
        definition: metricVersions.definition,
      })
      .from(metrics)
      .innerJoin(
        metricVersions,
        and(
          eq(metricVersions.metricId, metrics.id),
          eq(metricVersions.version, metrics.currentPublishedVersion),
          eq(metricVersions.status, "published"),
        ),
      )
      .where(and(eq(metrics.organizationId, tenant.organizationId), isNull(metrics.archivedAt))),
    db
      .select({
        connectionId: connectionResources.connectionId,
        externalId: connectionResources.externalId,
        configuration: connectionResources.configuration,
      })
      .from(connectionResources)
      .where(eq(connectionResources.organizationId, tenant.organizationId)),
  ]);

  const effectiveRange = range ?? "last_30_days";
  const timezone = organization?.timezone ?? "UTC";
  const window = dateRangeForPreset(effectiveRange, timezone);
  const seriesWindow = dateRangeForPreset("last_30_days", timezone);
  const [activityRows, cardRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.organizationId, tenant.organizationId),
          eq(sourceRecords.isDeleted, false),
          gte(sourceRecords.occurredAt, window.start),
          lt(sourceRecords.occurredAt, window.end),
        ),
      ),
    dashboardRow
      ? db
          .select({
            metricVersionId: dashboardCards.metricVersionId,
            cardType: dashboardCards.cardType,
            title: dashboardCards.title,
            position: dashboardCards.position,
            configuration: dashboardCards.configuration,
          })
          .from(dashboardCards)
          .where(
            and(
              eq(dashboardCards.organizationId, tenant.organizationId),
              eq(dashboardCards.dashboardId, dashboardRow.id),
            ),
          )
          .orderBy(asc(dashboardCards.position))
      : Promise.resolve([]),
  ]);

  const activeConnections = connectionRows.filter((connection) => connection.status === "active");
  const delayedConnections = connectionRows.filter(
    (connection) => connection.status !== "active" || connection.freshness === "delayed",
  );
  const resourceConfiguration = new Map(
    resourceRows.map((resource) => [
      `${resource.connectionId}:${resource.externalId}`,
      resource.configuration,
    ]),
  );
  const evaluatedMetrics = await Promise.all(
    metricRows.map(async (metric): Promise<DashboardMetricCardData> => {
      const definition = parseMetricDefinition(metric.definition);
      const resource = definition.source
        ? resourceConfiguration.get(
            `${definition.source.connectionId}:${definition.source.resourceId}`,
          )
        : undefined;
      const isGoogleSheet =
        definition.dataset === "source_records" && definition.source?.provider === "google-sheets";
      const hasTimeline =
        !["percentage", "ratio"].includes(definition.measure.operation) &&
        (!isGoogleSheet || typeof resource?.timestampColumn === "string");
      try {
        const [result, series] = await Promise.all([
          executeSavedMetricVersion(db, tenant.organizationId, metric.versionId, {
            ...window,
            timezone,
          }),
          hasTimeline
            ? executeDefinitionSeries(
                {
                  ...definition,
                  timeField: definition.timeField ?? "occurred_at",
                  timeGrain: "day",
                  groupBy: [],
                  comparison: "none",
                },
                tenant.organizationId,
                { ...seriesWindow, timezone },
              )
            : Promise.resolve([]),
        ]);
        const seriesValues = new Map(
          series.map((row) => [rowBucketKey(row.time_bucket), Number(row.value ?? 0)]),
        );
        const points = Array.from({ length: 30 }, (_, index) => {
          const instant = new Date(seriesWindow.start.getTime() + index * 86_400_000);
          const key = wallClockKey(instant, timezone);
          return {
            date: `${key}T00:00:00Z`,
            value: seriesValues.get(key) ?? 0,
            estimated: false,
          };
        });
        return {
          id: metric.id,
          versionId: metric.versionId,
          slug: metric.slug,
          name: metric.name,
          category: definition.category,
          sourceLabel: sourceLabel(definition),
          value: result.current.value,
          percentage: isPercentageMetric(definition),
          color: definition.visualization.color,
          points,
          hasTimeline,
          changePercent: result.changePercent,
          error: false,
        };
      } catch {
        return {
          id: metric.id,
          versionId: metric.versionId,
          slug: metric.slug,
          name: metric.name,
          category: definition.category,
          sourceLabel: sourceLabel(definition),
          value: null,
          percentage: isPercentageMetric(definition),
          color: definition.visualization.color,
          points: [],
          hasTimeline: false,
          changePercent: null,
          error: true,
        };
      }
    }),
  );
  const savedDashboard: MetricCardDashboard = dashboardRow
    ? { ...dashboardRow, cards: cardRows }
    : null;

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
        publishedMetrics={metricRows.length}
        pipelineIssues={Number(deadLetterRows[0]?.value ?? 0) + delayedConnections.length}
        periodLabel={rangeLabel(effectiveRange)}
      />
      <DashboardMetricCards
        metrics={evaluatedMetrics}
        dashboard={savedDashboard}
        range={effectiveRange}
        timezone={timezone}
      />
    </div>
  );
}
