import { and, desc, eq } from "drizzle-orm";
import { Database, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { DataPipeline } from "@/components/data-pipeline";
import { RefreshAllButton } from "@/components/refresh-all-button";
import { getDb } from "@/db/client";
import { connections, sourceRecords } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

export async function DataExplorer({ resourceType }: { resourceType?: string }) {
  const tenant = await requireTenantContext();
  const db = getDb();
  const [rows, connectionRows] = await Promise.all([
    db
      .select({
        id: sourceRecords.id,
        externalId: sourceRecords.externalId,
        resourceType: sourceRecords.resourceType,
        status: sourceRecords.status,
        occurredAt: sourceRecords.occurredAt,
        sourceUpdatedAt: sourceRecords.sourceUpdatedAt,
        provider: connections.provider,
        connectionName: connections.name,
      })
      .from(sourceRecords)
      .innerJoin(
        connections,
        and(
          eq(connections.id, sourceRecords.connectionId),
          eq(connections.organizationId, tenant.organizationId),
        ),
      )
      .where(
        and(
          eq(sourceRecords.organizationId, tenant.organizationId),
          eq(sourceRecords.isDeleted, false),
          ...(resourceType ? [eq(sourceRecords.resourceType, resourceType)] : []),
        ),
      )
      .orderBy(desc(sourceRecords.occurredAt), desc(sourceRecords.id))
      .limit(100),
    db
      .select({
        id: connections.id,
        name: connections.name,
        provider: connections.provider,
        status: connections.status,
        freshness: connections.freshness,
        lastSuccessfulSyncAt: connections.lastSuccessfulSyncAt,
      })
      .from(connections)
      .where(eq(connections.organizationId, tenant.organizationId))
      .orderBy(desc(connections.updatedAt)),
  ]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Source observability
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Data</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Inspect synchronized source records and monitor every connected pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshAllButton />
          <Link href="/metrics" className="secondary-link">
            Open metrics
          </Link>
        </div>
      </div>

      {resourceType ? (
        <div className="mt-4 text-xs text-[var(--muted)]">
          Resource: <span className="font-semibold text-[var(--foreground)]">{resourceType}</span> ·{" "}
          <Link href="/data" className="text-[var(--accent)]">
            clear
          </Link>
        </div>
      ) : null}

      <div className="mt-7">
        <DataPipeline connections={connectionRows} />
      </div>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Unified source records</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Latest 100 non-deleted records available to the metric engine.
            </p>
          </div>
          <span className="status-pill">{rows.length} loaded</span>
        </div>
        <div className="shell-card mt-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]">
            <span>Tenant-scoped normalized records</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} /> Public provenance fields only
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Database className="mx-auto text-[var(--muted)]" size={24} />
              <p className="mt-3 font-semibold">No synchronized records yet</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Use Refresh all data, or publish a metric to run its first source synchronization.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  <tr>
                    <th className="px-5 py-3 font-medium">External record</th>
                    <th className="px-5 py-3 font-medium">Resource</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 font-medium">Record date</th>
                    <th className="px-5 py-3 font-medium">Source updated</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--line)]">
                      <td className="max-w-56 truncate px-5 py-3 font-mono text-xs">
                        {row.externalId}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          className="font-medium hover:text-[var(--accent)]"
                          href={`/data?resourceType=${encodeURIComponent(row.resourceType)}`}
                        >
                          {row.resourceType}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {row.connectionName}
                        <span className="block text-xs capitalize text-[var(--muted)]">
                          {row.provider.replaceAll("-", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--muted)]">
                        {row.occurredAt?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-[var(--muted)]">
                        {row.sourceUpdatedAt?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-5 py-3">{row.status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
