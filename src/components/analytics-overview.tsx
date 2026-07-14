import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { Plus, Radio } from "lucide-react";
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
  const [[organization], [dashboardRow], metricRows, resourceRows] = await Promise.all([
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
  const [cardRows, [operationalSummary]] = await Promise.all([
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
    db
      .select({
        activeSources: sql<number>`(
          select count(*)::int from ${connections}
          where ${connections.organizationId} = ${tenant.organizationId}
            and ${connections.status} = 'active'
        )`,
        connectedSources: sql<number>`(
          select count(*)::int from ${connections}
          where ${connections.organizationId} = ${tenant.organizationId}
        )`,
        unifiedRecords: sql<number>`(
          select count(*)::int from ${sourceRecords}
          where ${sourceRecords.organizationId} = ${tenant.organizationId}
            and ${sourceRecords.isDeleted} = false
        )`,
        periodRecords: sql<number>`(
          select count(*)::int from ${sourceRecords}
          where ${sourceRecords.organizationId} = ${tenant.organizationId}
            and ${sourceRecords.isDeleted} = false
            and ${sourceRecords.occurredAt} >= ${window.start}
            and ${sourceRecords.occurredAt} < ${window.end}
        )`,
        pipelineIssues: sql<number>`(
          (
            select count(*)::int from ${connections}
            where ${connections.organizationId} = ${tenant.organizationId}
              and (${connections.status} <> 'active' or ${connections.freshness} = 'delayed')
          ) + (
            select count(*)::int from ${deadLetterEvents}
            where ${deadLetterEvents.organizationId} = ${tenant.organizationId}
          )
        )`,
      })
      .from(organizations)
      .where(eq(organizations.id, tenant.organizationId))
      .limit(1),
  ]);

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            <Radio size={12} /> Command center
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            A focused view of the numbers that matter right now.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshAllButton />
          <Link href="/metrics/new" className="primary-link">
            <Plus size={15} /> Build metric
          </Link>
        </div>
      </div>

      <DashboardDataCards
        activeSources={operationalSummary?.activeSources ?? 0}
        connectedSources={operationalSummary?.connectedSources ?? 0}
        unifiedRecords={operationalSummary?.unifiedRecords ?? 0}
        periodRecords={operationalSummary?.periodRecords ?? 0}
        pipelineIssues={operationalSummary?.pipelineIssues ?? 0}
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
