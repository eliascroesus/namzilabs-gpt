import { and, asc, count, desc, eq, gte, isNull, lt, min } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { DashboardDataCards } from "@/components/dashboard-data-cards";
import {
  DashboardMetricCards,
  type DashboardMetricCardData,
  type MetricCardDashboard,
} from "@/components/dashboard-metric-cards";
import { DashboardRangeSelector } from "@/components/dashboard-range-selector";
import {
  DashboardSourceCards,
  type DashboardSourceCardData,
} from "@/components/dashboard-source-cards";
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
  if (range === "all_time") return "All-time";
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

function wallClockKey(date: Date, timezone: string, grain: "hour" | "day"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return grain === "hour" ? `${day}T${values.hour}` : day;
}

function rowBucketKey(value: unknown, grain: "hour" | "day"): string {
  const raw = String(value).replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, grain === "hour" ? 13 : 10);
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return raw.slice(0, grain === "hour" ? 13 : 10);
  return date.toISOString().slice(0, grain === "hour" ? 13 : 10);
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
    [firstRecord],
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
      .select({
        id: connections.id,
        provider: connections.provider,
        name: connections.name,
        status: connections.status,
        freshness: connections.freshness,
        lastSuccessfulSyncAt: connections.lastSuccessfulSyncAt,
      })
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
      .select({ value: min(sourceRecords.occurredAt) })
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
  const presetWindow = dateRangeForPreset(effectiveRange, timezone);
  const window =
    effectiveRange === "all_time" && firstRecord?.value
      ? { start: new Date(firstRecord.value), end: presetWindow.end }
      : presetWindow;
  const windowDuration = window.end.getTime() - window.start.getTime();
  const seriesGrain: "hour" | "day" | "week" | "month" =
    effectiveRange === "today" || effectiveRange === "yesterday"
      ? "hour"
      : effectiveRange !== "all_time" || windowDuration <= 90 * 86_400_000
        ? "day"
        : windowDuration <= 3 * 365 * 86_400_000
          ? "week"
          : "month";
  const seriesStepMs = seriesGrain === "hour" ? 3_600_000 : 86_400_000;
  const seriesPointCount = Math.max(1, Math.ceil(windowDuration / seriesStepMs));
  const [activityRows, sourceCountRows, periodSourceCountRows, cardRows] = await Promise.all([
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
    db
      .select({ connectionId: sourceRecords.connectionId, value: count() })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.organizationId, tenant.organizationId),
          eq(sourceRecords.isDeleted, false),
        ),
      )
      .groupBy(sourceRecords.connectionId),
    db
      .select({ connectionId: sourceRecords.connectionId, value: count() })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.organizationId, tenant.organizationId),
          eq(sourceRecords.isDeleted, false),
          gte(sourceRecords.occurredAt, window.start),
          lt(sourceRecords.occurredAt, window.end),
        ),
      )
      .groupBy(sourceRecords.connectionId),
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
                  timeGrain: seriesGrain,
                  groupBy: [],
                  comparison: "none",
                },
                tenant.organizationId,
                { ...window, timezone },
              )
            : Promise.resolve([]),
        ]);
        const points =
          seriesGrain === "hour" || seriesGrain === "day"
            ? (() => {
                const seriesValues = new Map(
                  series.map((row) => [
                    rowBucketKey(row.time_bucket, seriesGrain),
                    Number(row.value ?? 0),
                  ]),
                );
                return Array.from({ length: seriesPointCount }, (_, index) => {
                  const instant = new Date(window.start.getTime() + index * seriesStepMs);
                  const key = wallClockKey(instant, timezone, seriesGrain);
                  return {
                    date: instant.toISOString(),
                    value: seriesValues.get(key) ?? 0,
                    estimated: false,
                  };
                });
              })()
            : series.map((row) => ({
                date: new Date(String(row.time_bucket)).toISOString(),
                value: Number(row.value ?? 0),
                estimated: false,
              }));
        return {
          id: metric.id,
          versionId: metric.versionId,
          slug: metric.slug,
          name: metric.name,
          category: definition.category,
          sourceLabel: sourceLabel(definition),
          value: result.current.value,
          percentage: isPercentageMetric(definition),
          goal: definition.goal?.target ?? null,
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
          goal: definition.goal?.target ?? null,
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
  const allCounts = new Map(sourceCountRows.map((row) => [row.connectionId, Number(row.value)]));
  const periodCounts = new Map(
    periodSourceCountRows.map((row) => [row.connectionId, Number(row.value)]),
  );
  const dashboardSources: DashboardSourceCardData[] = connectionRows.map((connection) => ({
    ...connection,
    records: allCounts.get(connection.id) ?? 0,
    periodRecords: periodCounts.get(connection.id) ?? 0,
  }));

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
      <DashboardSourceCards sources={dashboardSources} />
    </div>
  );
}
