import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Database, Layers3 } from "lucide-react";
import Link from "next/link";

import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { ConnectionActions } from "@/components/connection-actions";
import { requireTenantContext } from "@/server/auth/tenant";
import { asProviderId, connectionDetails } from "@/server/connections/service";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null) {
  return value
    ? value.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })
    : "Not yet";
}

export default async function ConnectionPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const tenant = await requireTenantContext();
  const { connectionId } = await params;
  const { connection, cursors, recentEvents, resources } = await connectionDetails(
    getDb(),
    tenant.organizationId,
    connectionId,
  );
  const manifest = getConnector(asProviderId(connection.provider)).manifest;
  const healthy = connection.status === "active" && connection.freshness !== "unavailable";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="provider-mark size-12">{manifest.logo}</span>
          <div>
            <p className="text-sm text-[var(--muted)]">{manifest.name}</p>
            <h1 className="mt-1 text-3xl font-semibold">{connection.name}</h1>
            <div
              className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthy ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}
            >
              {healthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {connection.status}
            </div>
          </div>
        </div>
        <ConnectionActions
          connectionId={connection.id}
          provider={connection.provider}
          status={connection.status}
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Connected account", connection.externalAccountName ?? "Pending authorization"],
          ["Last event", dateLabel(connection.lastEventAt)],
          ["Reconciled", dateLabel(connection.lastReconciledAt)],
          ["Freshness", connection.freshness],
        ].map(([label, value]) => (
          <div key={label} className="shell-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {label}
            </div>
            <div className="mt-2 text-sm font-semibold capitalize">{value}</div>
          </div>
        ))}
      </div>

      {connection.provider === "google-sheets" && connection.status === "active" ? (
        <section className="shell-card mt-6 flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="icon-tile">
              <Layers3 size={17} />
            </span>
            <div>
              <h2 className="font-semibold">Google account connected</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                This connection covers every spreadsheet this Google account can access. Choose a
                spreadsheet and tab inside each metric instead of locking the account to one file.
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {resources.length} tab{resources.length === 1 ? "" : "s"} currently used by saved
                metrics
              </p>
            </div>
          </div>
          <Link href={`/metrics/new?connection=${connection.id}`} className="primary-link shrink-0">
            Build from this account <ArrowRight size={15} />
          </Link>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="shell-card p-5">
          <div className="flex items-center gap-2">
            <Database size={17} className="text-[var(--brand)]" />
            <h2 className="font-bold">Recent events</h2>
          </div>
          <div className="mt-4 divide-y divide-[var(--line)]">
            {recentEvents.length ? (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{event.eventType}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {dateLabel(event.receivedAt)}
                    </div>
                  </div>
                  <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs capitalize">
                    {event.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-sm text-[var(--muted)]">
                No events received yet.
              </div>
            )}
          </div>
        </section>
        <section className="shell-card p-5">
          <div className="flex items-center gap-2">
            <Clock3 size={17} className="text-[var(--brand)]" />
            <h2 className="font-bold">Sync cursors</h2>
          </div>
          <div className="mt-4 space-y-3">
            {cursors.length ? (
              cursors.map((cursor) => (
                <div key={cursor.id} className="rounded-xl bg-[var(--surface-2)] p-3 text-sm">
                  <div className="font-semibold">{cursor.resourceType}</div>
                  <div className="mt-1 truncate font-mono text-xs text-[var(--muted)]">
                    {cursor.cursor ?? "Initial sync"}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                A cursor appears after the first backfill or reconciliation.
              </div>
            )}
          </div>
        </section>
      </div>

      {connection.lastErrorCode ? (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
          <div className="font-semibold">{connection.lastErrorCode}</div>
          <div className="mt-1">{connection.lastErrorMessage}</div>
        </div>
      ) : null}
    </div>
  );
}
