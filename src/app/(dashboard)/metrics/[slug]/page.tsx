import { and, eq } from "drizzle-orm";
import { ArrowLeft, Database, GitBranch } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { metrics, metricVersions } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

export const dynamic = "force-dynamic";

export default async function MetricDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await requireTenantContext();
  const slug = (await params).slug;
  const db = getDb();
  const [metric] = await db
    .select()
    .from(metrics)
    .where(and(eq(metrics.organizationId, tenant.organizationId), eq(metrics.slug, slug)))
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

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/metrics"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={15} /> Metrics
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{metric.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {metric.description || "No description"}
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          Version {version.version} · {version.status}
        </span>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <section className="shell-card p-5">
          <h2 className="font-bold">Plain-language definition</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{version.plainLanguage}</p>
        </section>
        <section className="shell-card p-5">
          <h2 className="font-bold">Formula</h2>
          <code className="mt-3 block rounded-lg bg-[var(--surface-2)] p-3 text-sm">
            {version.formula}
          </code>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Definition hash: {version.definitionHash.slice(0, 16)}…
          </p>
        </section>
      </div>
      <section className="shell-card mt-4 p-5">
        <div className="flex items-center gap-2">
          <Database size={17} className="text-[var(--brand)]" />
          <h2 className="font-bold">Stored provenance</h2>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-[var(--surface-2)] p-4 text-xs leading-5">
          {JSON.stringify(version.definition, null, 2)}
        </pre>
        <div className="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]">
          <GitBranch size={14} /> Dashboard cards pinned to this version do not change when a later
          version is published.
        </div>
      </section>
    </div>
  );
}
