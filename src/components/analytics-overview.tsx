import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Gauge,
  Plus,
  Radio,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { MetricVisualizations, type MetricVisualization } from "@/components/metric-visualizations";
import { RefreshAllButton } from "@/components/refresh-all-button";
import { getDb } from "@/db/client";
import { connections, deadLetterEvents, metrics, metricVersions, sourceRecords } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";
import { parseMetricDefinition, type MetricDefinition } from "@/server/metrics/dsl";
import { executeDefinitionSeries, executeSavedMetricVersion } from "@/server/metrics/service";

function isPercentageMetric(definition: Record<string, unknown>): boolean {
  const measure = definition.measure;
  if (!measure || typeof measure !== "object") return false;
  const operation = Reflect.get(measure, "operation");
  return (
    operation === "percentage" || (operation === "ratio" && Reflect.get(measure, "asPercentage"))
  );
}

function metricLabel(value: number | null, percentage = false): string {
  if (value === null) return "—";
  const formatted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return percentage ? `${formatted}%` : formatted;
}

function sourceLabel(definition: MetricDefinition): string {
  if (!definition.source) return "Combined metrics";
  return (
    [definition.source.spreadsheetName, definition.source.sheetName].filter(Boolean).join(" / ") ||
    definition.source.provider.replaceAll("-", " ")
  );
}

export async function AnalyticsOverview({ title = "Live overview" }: { title?: string }) {
  const tenant = await requireTenantContext();
  const db = getDb();
  const [connectionRows, recordRows, activityRows, deadLetterRows, metricRows] = await Promise.all([
    db
      .select({
        id: connections.id,
        name: connections.name,
        provider: connections.provider,
        status: connections.status,
        freshness: connections.freshness,
        lastSuccessfulSyncAt: connections.lastSuccessfulSyncAt,
        lastErrorCode: connections.lastErrorCode,
      })
      .from(connections)
      .where(eq(connections.organizationId, tenant.organizationId))
      .orderBy(desc(connections.updatedAt)),
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
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.organizationId, tenant.organizationId),
          eq(sourceRecords.isDeleted, false),
          gte(sourceRecords.occurredAt, sql`now() - interval '30 days'`),
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
      .where(eq(metrics.organizationId, tenant.organizationId))
      .orderBy(desc(metrics.updatedAt))
      .limit(12),
  ]);

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  const evaluatedMetrics = await Promise.all(
    metricRows.map(async (metric) => {
      try {
        const definition = parseMetricDefinition(metric.definition);
        const trendEligible = !["percentage", "ratio"].includes(definition.measure.operation);
        const [result, trendResult] = await Promise.all([
          executeSavedMetricVersion(db, tenant.organizationId, metric.versionId, {
            start,
            end,
            timezone: "UTC",
          }),
          trendEligible
            ? executeDefinitionSeries(
                {
                  ...definition,
                  timeField: definition.timeField ?? "occurred_at",
                  timeGrain: "day",
                  groupBy: [],
                  comparison: "none",
                },
                tenant.organizationId,
                { start, end, timezone: "UTC" },
              )
            : Promise.resolve([]),
        ]);
        const trendValues = new Map(
          trendResult.map((row) => [
            new Date(String(row.time_bucket)).toISOString().slice(0, 10),
            Number(row.value ?? 0),
          ]),
        );
        const points = Array.from({ length: 30 }, (_, index) => {
          const day = new Date(end);
          day.setUTCHours(0, 0, 0, 0);
          day.setUTCDate(day.getUTCDate() - (29 - index));
          const date = day.toISOString().slice(0, 10);
          return { date, value: trendValues.get(date) ?? 0 };
        });
        return { ...metric, definition, ...result, points, trendEligible, error: false };
      } catch {
        const definition = parseMetricDefinition(metric.definition);
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
  const activeConnections = connectionRows.filter((connection) => connection.status === "active");
  const delayedConnections = connectionRows.filter(
    (connection) => connection.status !== "active" || connection.freshness === "delayed",
  );
  const records = Number(recordRows[0]?.value ?? 0);
  const activities = Number(activityRows[0]?.value ?? 0);
  const deadLetters = Number(deadLetterRows[0]?.value ?? 0);
  const visualizations: MetricVisualization[] = evaluatedMetrics.map((metric) => ({
    id: metric.id,
    name: metric.name,
    sourceLabel: sourceLabel(metric.definition),
    value: metric.current?.value ?? null,
    percentage: isPercentageMetric(metric.definition),
    trendEligible: metric.trendEligible,
    preferred: metric.definition.visualization.display,
    color: metric.definition.visualization.color,
    points: metric.points,
  }));

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            <Radio size={12} /> Command center
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Your published metrics and data pipeline health, updated from connected systems.
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshAllButton />
          <Link href="/integrations" className="secondary-link">
            <Database size={15} /> Sources
          </Link>
          <Link href="/metrics/new" className="primary-link">
            <Plus size={15} /> Build metric
          </Link>
        </div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active sources", activeConnections.length, `${connectionRows.length} connected`, Gauge],
          ["Unified records", records, "Available for metrics", Database],
          ["30-day records", activities, "Available in this period", Radio],
          [
            "Pipeline issues",
            deadLetters + delayedConnections.length,
            "Need attention",
            AlertTriangle,
          ],
        ].map(([label, value, detail, Icon]) => {
          const TileIcon = Icon as typeof Gauge;
          return (
            <article className="shell-card relative overflow-hidden p-5" key={String(label)}>
              <div className="absolute -right-5 -top-5 size-24 rounded-full bg-[var(--accent)]/5 blur-2xl" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--muted)]">{String(label)}</p>
                <TileIcon size={15} className="text-[var(--accent)]" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {Number(value).toLocaleString()}
              </p>
              <p className="mt-3 text-[11px] text-[var(--muted)]">{String(detail)}</p>
            </article>
          );
        })}
      </div>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Live metrics</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Current 30 days compared with the prior period.
            </p>
          </div>
          <Link href="/metrics" className="text-button">
            View all <ArrowRight size={13} />
          </Link>
        </div>
        {evaluatedMetrics.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {evaluatedMetrics.slice(0, 8).map((metric) => {
              const change = metric.changePercent;
              const positive = typeof change === "number" && change >= 0;
              return (
                <Link
                  key={metric.id}
                  href={`/metrics/${metric.slug}`}
                  className="shell-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-[#b8c0ce]">{metric.name}</p>
                    <span
                      className={`status-dot ${metric.error ? "bg-[var(--danger)]" : "bg-[var(--success)]"}`}
                    />
                  </div>
                  <p className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
                    {metric.error
                      ? "—"
                      : metricLabel(
                          metric.current?.value ?? null,
                          isPercentageMetric(metric.definition),
                        )}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
                    {typeof change === "number" ? (
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}
                      >
                        {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {positive ? "+" : ""}
                        {change.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">No prior comparison</span>
                    )}
                    <span className="text-[var(--muted)]">
                      {metric.current?.matchingCount?.toLocaleString() ?? 0} rows
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="shell-card mt-3 flex flex-col items-center px-6 py-12 text-center">
            <Gauge size={25} className="text-[var(--muted)]" />
            <h3 className="mt-4 font-semibold">Turn connected data into a live metric</h3>
            <p className="mt-2 max-w-lg text-sm text-[var(--muted)]">
              Pick an app, inspect its latest records, then choose columns and filters in the new
              metric builder.
            </p>
            <Link href="/metrics/new" className="primary-link mt-5">
              Build the first metric <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>
      <MetricVisualizations metrics={visualizations} />
    </div>
  );
}
