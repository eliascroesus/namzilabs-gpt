import { and, count, desc, eq } from "drizzle-orm";
import { Activity, Database, Layers3, PlugZap } from "lucide-react";
import Link from "next/link";

import { DataPipeline } from "@/components/data-pipeline";
import { DataRecordsBrowser, type DataRecordRow } from "@/components/data-records-browser";
import { RefreshAllButton } from "@/components/refresh-all-button";
import { getDb } from "@/db/client";
import { connections, sourceRecords } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

export async function DataExplorer({ resourceType }: { resourceType?: string }) {
  const tenant = await requireTenantContext();
  const db = getDb();
  const [rows, connectionRows, totals, resourceCounts] = await Promise.all([
    db
      .select({
        id: sourceRecords.id,
        externalId: sourceRecords.externalId,
        displayName: sourceRecords.displayName,
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
      .limit(250),
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
      .select({ resourceType: sourceRecords.resourceType, value: count() })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.organizationId, tenant.organizationId),
          eq(sourceRecords.isDeleted, false),
        ),
      )
      .groupBy(sourceRecords.resourceType)
      .orderBy(desc(count())),
  ]);
  const totalRecords = Number(totals[0]?.value ?? 0);
  const activeSources = connectionRows.filter(
    (connection) => connection.status === "active",
  ).length;
  const recordRows: DataRecordRow[] = rows.map((row) => ({
    ...row,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
  }));

  return (
    <div className="page-layout data-page mx-auto max-w-[1500px]">
      <div className="page-header">
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

      <div className="data-summary-grid">
        {[
          ["Available records", totalRecords, "Ready for metrics", Database],
          ["Active sources", activeSources, `${connectionRows.length} connected`, PlugZap],
          ["Data objects", resourceCounts.length, "Distinct synchronized types", Layers3],
          ["Recent sample", rows.length, "Loaded into this explorer", Activity],
        ].map(([label, value, detail, Icon]) => {
          const TileIcon = Icon as typeof Database;
          return (
            <article key={String(label)} className="data-summary-card shell-card">
              <div className="data-summary-card-heading">
                <span>{String(label)}</span>
                <TileIcon size={14} aria-hidden="true" />
              </div>
              <strong>{Number(value).toLocaleString()}</strong>
              <small>{String(detail)}</small>
            </article>
          );
        })}
      </div>

      {resourceCounts.length ? (
        <section className="data-object-panel shell-card">
          <div className="data-object-panel-heading">
            <div>
              <h2>Data objects</h2>
              <p>Choose a synchronized object to inspect its latest records.</p>
            </div>
            <span>{resourceCounts.length} available</span>
          </div>
          <div className="data-object-list">
            {resourceCounts.map((resource) => (
              <Link
                key={resource.resourceType}
                href={`/data?resourceType=${encodeURIComponent(resource.resourceType)}`}
                className="resource-count-card"
              >
                <span className="truncate">{resource.resourceType.replaceAll(":", " / ")}</span>
                <strong>{Number(resource.value).toLocaleString()}</strong>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="data-page-section">
        <DataPipeline connections={connectionRows} />
      </div>

      <div className="data-page-section">
        <DataRecordsBrowser rows={recordRows} />
      </div>
    </div>
  );
}
