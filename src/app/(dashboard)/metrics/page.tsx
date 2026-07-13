import { desc, eq } from "drizzle-orm";
import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { getDb } from "@/db/client";
import { metrics } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

export const metadata = { title: "Metrics" };
export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const tenant = await requireTenantContext();
  const rows = await getDb()
    .select()
    .from(metrics)
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
            <Link
              key={metric.id}
              href={`/metrics/${metric.slug}`}
              className="shell-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-start justify-between">
                <span className="rounded-md border border-[#4a3fa0] bg-[var(--brand-soft)] px-2 py-1 text-[10px] font-bold text-[var(--brand-dark)]">
                  {metric.currentPublishedVersion
                    ? `v${metric.currentPublishedVersion} published`
                    : "draft only"}
                </span>
                <ArrowRight
                  size={15}
                  className="text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-white"
                />
              </div>
              <h2 className="mt-5 font-semibold">{metric.name}</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {metric.description || "No description"}
              </p>
              <div className="mt-4 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                <ShieldCheck size={13} /> Parameterized · traceable
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
