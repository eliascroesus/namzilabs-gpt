import { and, desc, eq, isNull } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { MetricLibrary } from "@/components/metric-library";
import { getDb } from "@/db/client";
import { metrics, metricVersions } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";
import { parseMetricDefinition } from "@/server/metrics/dsl";

export const metadata = { title: "Metrics" };
export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const tenant = await requireTenantContext();
  const rows = await getDb()
    .select({
      id: metrics.id,
      slug: metrics.slug,
      name: metrics.name,
      description: metrics.description,
      currentPublishedVersion: metrics.currentPublishedVersion,
      definition: metricVersions.definition,
    })
    .from(metrics)
    .leftJoin(
      metricVersions,
      and(
        eq(metricVersions.metricId, metrics.id),
        eq(metricVersions.version, metrics.currentPublishedVersion),
      ),
    )
    .where(and(eq(metrics.organizationId, tenant.organizationId), isNull(metrics.archivedAt)))
    .orderBy(desc(metrics.updatedAt));
  return (
    <div className="page-layout mx-auto max-w-6xl">
      <div className="page-header">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Metric library
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Metrics</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Live business definitions built from connected sources, real records, and explicit
            filters.
          </p>
        </div>
        <Link href="/metrics/new" className="primary-link">
          <Plus size={16} /> Build metric
        </Link>
      </div>
      {rows.length === 0 ? (
        <section className="shell-card mt-7 px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">No published metrics yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--muted)]">
            Choose a connected app, inspect recent source records, and build the first live KPI.
          </p>
          <Link href="/metrics/new" className="primary-link mt-5">
            Build the first metric
          </Link>
        </section>
      ) : (
        <MetricLibrary
          metrics={rows.map((metric) => ({
            id: metric.id,
            slug: metric.slug,
            name: metric.name,
            description: metric.description,
            currentPublishedVersion: metric.currentPublishedVersion,
            category: metric.definition
              ? parseMetricDefinition(metric.definition).category
              : "Uncategorized",
          }))}
        />
      )}
    </div>
  );
}
