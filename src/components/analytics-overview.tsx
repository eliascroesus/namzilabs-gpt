import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Clock3, Database, PlugZap } from "lucide-react";
import Link from "next/link";

import { getDb } from "@/db/client";
import { activityFacts, connections, deadLetterEvents, sourceRecords } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

function dateLabel(value: Date | null): string {
  return value ? value.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

export async function AnalyticsOverview({ title = "Overview" }: { title?: string }) {
  const tenant = await requireTenantContext();
  const db = getDb();
  const [connectionRows, recordRows, activityRows, deadLetterRows] = await Promise.all([
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
      .from(activityFacts)
      .where(
        and(
          eq(activityFacts.organizationId, tenant.organizationId),
          eq(activityFacts.isDeleted, false),
          gte(activityFacts.occurredAt, sql`now() - interval '30 days'`),
        ),
      ),
    db
      .select({ value: count() })
      .from(deadLetterEvents)
      .where(eq(deadLetterEvents.organizationId, tenant.organizationId)),
  ]);

  const activeConnections = connectionRows.filter((connection) => connection.status === "active");
  const records = Number(recordRows[0]?.value ?? 0);
  const activities = Number(activityRows[0]?.value ?? 0);
  const deadLetters = Number(deadLetterRows[0]?.value ?? 0);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Unified operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Tenant-scoped source and processing state. No fixture records are shown here.
          </p>
        </div>
        <Link
          href="/integrations"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
        >
          <PlugZap size={16} /> Manage integrations
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active sources", activeConnections.length, `${connectionRows.length} configured`],
          ["Normalized records", records, "Current, non-deleted source records"],
          ["Activities", activities, "Occurred during the last 30 days"],
          [
            "Dead letters",
            deadLetters,
            deadLetters === 0 ? "No unreplayed failures" : "Review required",
          ],
        ].map(([label, value, detail]) => (
          <article className="shell-card p-5" key={String(label)}>
            <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {Number(value).toLocaleString()}
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">{detail}</p>
          </article>
        ))}
      </div>

      {connectionRows.length === 0 ? (
        <section className="shell-card mt-5 px-6 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Database size={22} />
          </span>
          <h2 className="mt-4 text-xl font-bold">Connect the first real data source</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
            Metrics and charts remain empty until a provider is authorized and genuine records have
            completed ingestion. Namzi Data never substitutes sample success states.
          </p>
          <Link
            href="/integrations"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            Choose an integration
          </Link>
        </section>
      ) : (
        <section className="shell-card mt-5 overflow-hidden">
          <div className="border-b border-[var(--line)] p-5">
            <h2 className="font-bold">Connection freshness</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Delayed, failed and unauthorised sources remain visible instead of reporting success.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Connection</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">State</th>
                  <th className="px-5 py-3 font-medium">Last successful sync</th>
                </tr>
              </thead>
              <tbody>
                {connectionRows.map((connection) => {
                  const healthy =
                    connection.status === "active" &&
                    !["delayed", "unavailable"].includes(connection.freshness);
                  return (
                    <tr className="border-t border-[var(--line)]" key={connection.id}>
                      <td className="px-5 py-3 font-semibold">
                        <Link href={`/integrations/${connection.id}`}>{connection.name}</Link>
                      </td>
                      <td className="px-5 py-3 capitalize">{connection.provider}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                        >
                          {healthy ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                          {connection.status} · {connection.freshness}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 size={13} /> {dateLabel(connection.lastSuccessfulSyncAt)}
                        </span>
                        {connection.lastErrorCode ? (
                          <span className="mt-1 block text-xs text-amber-800">
                            {connection.lastErrorCode}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
