import { and, desc, eq } from "drizzle-orm";
import { Database, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { getDb } from "@/db/client";
import { activityFacts, connections } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

export async function DataExplorer({ activityType }: { activityType?: string }) {
  const tenant = await requireTenantContext();
  const db = getDb();
  const rows = await db
    .select({
      id: activityFacts.id,
      activityType: activityFacts.activityType,
      status: activityFacts.status,
      channel: activityFacts.channel,
      occurredAt: activityFacts.occurredAt,
      provider: connections.provider,
      connectionName: connections.name,
    })
    .from(activityFacts)
    .innerJoin(
      connections,
      and(
        eq(connections.id, activityFacts.connectionId),
        eq(connections.organizationId, tenant.organizationId),
      ),
    )
    .where(
      and(
        eq(activityFacts.organizationId, tenant.organizationId),
        eq(activityFacts.isDeleted, false),
        ...(activityType ? [eq(activityFacts.activityType, activityType)] : []),
      ),
    )
    .orderBy(desc(activityFacts.occurredAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Trace every number</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Data explorer</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Up to 100 genuine, non-deleted activity facts. Sensitive identifiers are not selected.
          </p>
        </div>
        <Link
          href="/metrics"
          className="inline-flex h-10 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold"
        >
          Open metrics
        </Link>
      </div>
      {activityType ? (
        <div className="mt-4 text-xs text-[var(--muted)]">
          Filter: <span className="font-semibold text-[var(--foreground)]">{activityType}</span> ·{" "}
          <Link href="/data" className="text-[var(--brand)]">
            clear
          </Link>
        </div>
      ) : null}
      <div className="shell-card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]">
          <span>{rows.length} records loaded</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} /> Public provenance fields only
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Database className="mx-auto text-[var(--muted)]" size={24} />
            <p className="mt-3 font-semibold">No matching customer records</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Connect and reconcile a provider, or clear the activity filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Record</th>
                  <th className="px-5 py-3 font-medium">Activity</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Occurred</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="px-5 py-3 font-mono text-xs">{row.id}</td>
                    <td className="px-5 py-3 font-semibold">{row.activityType}</td>
                    <td className="px-5 py-3">
                      {row.connectionName}
                      <span className="block text-xs capitalize text-[var(--muted)]">
                        {row.provider}
                      </span>
                    </td>
                    <td className="px-5 py-3">{row.channel ?? "—"}</td>
                    <td className="px-5 py-3">{row.occurredAt.toLocaleString()}</td>
                    <td className="px-5 py-3">{row.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
