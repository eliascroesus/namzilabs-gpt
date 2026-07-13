import { and, desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
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
    .where(eq(metrics.organizationId, tenant.organizationId))
    .orderBy(desc(metrics.updatedAt));
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((metric) => (
            <MetricCard
              key={metric.id}
              metric={{
                ...metric,
                category: metric.definition
                  ? parseMetricDefinition(metric.definition).category
                  : "Uncategorized",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
