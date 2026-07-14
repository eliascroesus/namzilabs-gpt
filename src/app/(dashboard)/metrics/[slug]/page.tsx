import { and, eq, isNull, ne } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricDetailEditor, type MetricComponentOption } from "@/components/metric-detail-editor";
import { getDb } from "@/db/client";
import { connectionResources, metrics, metricVersions } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";
import { executeSavedMetricVersion } from "@/server/metrics/service";
import { parseMetricDefinition } from "@/server/metrics/dsl";

export const dynamic = "force-dynamic";

function sourceLabel(definition: unknown): string {
  const parsed = parseMetricDefinition(definition);
  if (!parsed.source) return "Combined metrics";
  return (
    [parsed.source.spreadsheetName, parsed.source.sheetName].filter(Boolean).join(" / ") ||
    parsed.source.provider
  );
}

export default async function MetricDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await requireTenantContext();
  const slug = (await params).slug;
  const db = getDb();
  const [metric] = await db
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.organizationId, tenant.organizationId),
        eq(metrics.slug, slug),
        isNull(metrics.archivedAt),
      ),
    )
    .limit(1);
  if (!metric || !metric.currentPublishedVersion) notFound();
  const [version] = await db
    .select()
    .from(metricVersions)
    .where(
      and(
        eq(metricVersions.organizationId, tenant.organizationId),
        eq(metricVersions.metricId, metric.id),
        eq(metricVersions.version, metric.currentPublishedVersion),
      ),
    )
    .limit(1);
  if (!version) notFound();
  const definition = parseMetricDefinition(version.definition);
  const [resource, componentRows] = await Promise.all([
    definition.source
      ? db
          .select({ configuration: connectionResources.configuration })
          .from(connectionResources)
          .where(
            and(
              eq(connectionResources.organizationId, tenant.organizationId),
              eq(connectionResources.connectionId, definition.source.connectionId),
              eq(connectionResources.externalId, definition.source.resourceId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        metricId: metrics.id,
        versionId: metricVersions.id,
        name: metrics.name,
        description: metrics.description,
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
      .where(
        and(
          eq(metrics.organizationId, tenant.organizationId),
          ne(metrics.id, metric.id),
          isNull(metrics.archivedAt),
        ),
      ),
  ]);
  const components: MetricComponentOption[] = componentRows.map((component) => ({
    metricId: component.metricId,
    versionId: component.versionId,
    name: component.name,
    description: component.description,
    sourceLabel: sourceLabel(component.definition),
  }));
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  let currentValue: number | null = null;
  try {
    const result = await executeSavedMetricVersion(db, tenant.organizationId, version.id, {
      start,
      end,
      timezone: "UTC",
    });
    currentValue = result.current.value;
  } catch {
    currentValue = null;
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <Link href="/metrics" className="eyebrow-link">
        <ArrowLeft size={15} /> Metrics
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            Metric definition
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{metric.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Inspect its source, row identity, date field, calculation, and rules—then publish edits.
          </p>
        </div>
      </div>
      <MetricDetailEditor
        metric={{
          id: metric.id,
          name: metric.name,
          description: metric.description,
          slug: metric.slug,
        }}
        version={{
          version: version.version,
          status: version.status,
          definition,
          plainLanguage: version.plainLanguage,
          formula: version.formula,
          definitionHash: version.definitionHash,
        }}
        resourceConfiguration={resource?.configuration ?? null}
        components={components}
        currentValue={currentValue}
      />
    </div>
  );
}
