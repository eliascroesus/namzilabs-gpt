import { and, asc, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { DashboardDataCards } from "@/components/dashboard-data-cards";
import {
  DashboardWorkspace,
  type DashboardMetric,
  type SavedDashboard,
} from "@/components/dashboard-workspace";
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

function wallClockKey(date: Date, timezone: string, hourly: boolean): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(hourly ? { hour: "2-digit", hourCycle: "h23" as const } : {}),
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return hourly ? `${day}T${values.hour}` : day;
}

function rowBucketKey(value: unknown, hourly: boolean): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, hourly ? 13 : 10);
  return date.toISOString().slice(0, hourly ? 13 : 10);
}

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
  const [
    [organization],
    [dashboardRow],
    connectionRows,
    recordRows,
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
        status: connections.status,
        freshness: connections.freshness,
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
      .select({ value: count() })
      .from(deadLetterEvents)
      .where(eq(deadLetterEvents.organizationId, tenant.organizationId)),
    db
      .select({
        id: metrics.id,
        name: metrics.name,
        slug: metrics.slug,
        versionId: metricVersions.id,
        formula: metricVersions.formula,
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
      .where(and(eq(metrics.organizationId, tenant.organizationId), isNull(metrics.archivedAt)))
      .orderBy(desc(metrics.updatedAt))
      .limit(40),
    db
      .select({
        connectionId: connectionResources.connectionId,
        externalId: connectionResources.externalId,
        configuration: connectionResources.configuration,
      })
      .from(connectionResources)
      .where(eq(connectionResources.organizationId, tenant.organizationId)),
  ]);

  const timezone = organization?.timezone ?? dashboardRow?.timezone ?? "UTC";
  const savedRange = dashboardRow?.defaultDateRange as DatePreset | undefined;
  const effectiveRange =
    range ??
    (savedRange && ["today", "yesterday", "last_7_days", "last_30_days"].includes(savedRange)
      ? savedRange
      : "last_30_days");
  const window = dateRangeForPreset(effectiveRange, timezone);
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
  const recordCount = Number(recordRows[0]?.value ?? 0);
  const activityCount = Number(activityRows[0]?.value ?? 0);
  const deadLetterCount = Number(deadLetterRows[0]?.value ?? 0);

  const resourceConfiguration = new Map(
    resourceRows.map((resource) => [
      `${resource.connectionId}:${resource.externalId}`,
      resource.configuration,
    ]),
  );
  const hourly = effectiveRange === "today" || effectiveRange === "yesterday";
  const interval = hourly ? 3_600_000 : 86_400_000;
  const bucketCount = Math.max(
    1,
    Math.round((window.end.getTime() - window.start.getTime()) / interval),
  );
  const evaluatedMetrics = await Promise.all(
    metricRows.map(async (metric) => {
      const definition = parseMetricDefinition(metric.definition);
      const trendEligible = !["percentage", "ratio"].includes(definition.measure.operation);
      const resource = definition.source
        ? resourceConfiguration.get(
            `${definition.source.connectionId}:${definition.source.resourceId}`,
          )
        : undefined;
      const estimatedTime =
        definition.dataset === "source_records" &&
        definition.source?.provider === "google-sheets" &&
        typeof resource?.timestampColumn !== "string";
      try {
        const [result, trendResult] = await Promise.all([
          executeSavedMetricVersion(db, tenant.organizationId, metric.versionId, {
            ...window,
            timezone,
          }),
          trendEligible
            ? executeDefinitionSeries(
                {
                  ...definition,
                  timeField: definition.timeField ?? "occurred_at",
                  timeGrain: hourly ? "hour" : "day",
                  groupBy: [],
                  comparison: "none",
                },
                tenant.organizationId,
                { ...window, timezone },
              )
            : Promise.resolve([]),
        ]);
        const trendValues = new Map(
          trendResult.map((row) => [rowBucketKey(row.time_bucket, hourly), Number(row.value ?? 0)]),
        );
        const points = Array.from({ length: bucketCount }, (_, index) => {
          const instant = new Date(window.start.getTime() + index * interval);
          const key = wallClockKey(instant, timezone, hourly);
          return {
            date: hourly ? `${key}:00:00Z` : `${key}T00:00:00Z`,
            value: trendValues.get(key) ?? 0,
            estimated: estimatedTime,
          };
        });
        return {
          ...metric,
          definition,
          ...result,
          points,
          trendEligible,
          error: false,
        };
      } catch {
        return {
          ...metric,
          definition,
          current: null,
          previous: null,
          changePercent: null,
          points: [],
          trendEligible: false,
          error: true,
        };
      }
    }),
  );

  const dashboardMetrics: DashboardMetric[] = evaluatedMetrics.map((metric) => ({
    id: metric.id,
    versionId: metric.versionId,
    name: metric.name,
    slug: metric.slug,
    category: metric.definition.category,
    sourceLabel: sourceLabel(metric.definition),
    value: metric.current?.value ?? null,
    percentage: isPercentageMetric(metric.definition),
    trendEligible: metric.trendEligible,
    preferred: metric.definition.visualization.display,
    color: metric.definition.visualization.color,
    points: metric.points,
    changePercent: metric.changePercent,
    matchingCount: metric.current?.matchingCount ?? 0,
    error: metric.error,
  }));
  const savedDashboard: SavedDashboard = dashboardRow ? { ...dashboardRow, cards: cardRows } : null;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="dashboard-page-header flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="flex flex-wrap gap-2">
          <RefreshAllButton />
          <Link href="/metrics/new" className="primary-link">
            <Plus size={15} /> Build metric
          </Link>
        </div>
      </div>

      <DashboardDataCards
        activeSources={activeConnections.length}
        connectedSources={connectionRows.length}
        unifiedRecords={recordCount}
        periodRecords={activityCount}
        pipelineIssues={deadLetterCount + delayedConnections.length}
        periodLabel={rangeLabel(effectiveRange)}
      />

      <DashboardWorkspace
        metrics={dashboardMetrics}
        dashboard={savedDashboard}
        range={effectiveRange}
        timezone={timezone}
      />
    </div>
  );
}
