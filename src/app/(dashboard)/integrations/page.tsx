import { desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowRight, CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";

import { connectors } from "@/connectors/registry";
import type { ProviderId } from "@/connectors/types";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { env } from "@/lib/env";
import { requireTenantContext } from "@/server/auth/tenant";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const tenant = await requireTenantContext();
  const config = env();
  const rows = await getDb()
    .select()
    .from(connections)
    .where(eq(connections.organizationId, tenant.organizationId))
    .orderBy(desc(connections.updatedAt));
  const available = (provider: ProviderId) => {
    if (provider === "google-sheets")
      return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
    if (provider === "calendly")
      return Boolean(config.CALENDLY_CLIENT_ID && config.CALENDLY_CLIENT_SECRET);
    if (provider === "close") return Boolean(config.CLOSE_CLIENT_ID && config.CLOSE_CLIENT_SECRET);
    return true;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Data sources</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Real connection health and the connector types enabled in this environment.
          </p>
        </div>
        <Link
          href="/integrations/new/webhook"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
        >
          <Plus size={16} /> New webhook
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Connected sources</h2>
        {rows.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">
            No provider has been connected for this organization.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {rows.map((connection) => {
              const healthy =
                connection.status === "active" &&
                !["delayed", "unavailable"].includes(connection.freshness);
              return (
                <Link
                  key={connection.id}
                  href={`/integrations/${connection.id}`}
                  className="shell-card flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <p className="font-semibold">{connection.name}</p>
                    <p className="mt-1 text-xs capitalize text-[var(--muted)]">
                      {connection.provider} · {connection.freshness}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                  >
                    {healthy ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {connection.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-9">
        <h2 className="text-lg font-bold">Add a source</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {connectors.map((connector) => {
            const enabled = available(connector.manifest.id);
            const content = (
              <>
                <div className="flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand-dark)]">
                    {connector.manifest.logo}
                  </span>
                  {enabled ? (
                    <ArrowRight size={17} className="text-slate-400" />
                  ) : (
                    <AlertTriangle size={17} className="text-amber-600" />
                  )}
                </div>
                <h3 className="mt-5 font-bold">{connector.manifest.name}</h3>
                <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">
                  {enabled
                    ? connector.manifest.description
                    : "Unavailable until this environment has an approved provider application and credentials."}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {connector.manifest.capabilities.slice(0, 3).map((capability) => (
                    <span
                      key={capability}
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </>
            );
            return enabled ? (
              <Link
                key={connector.manifest.id}
                href={`/integrations/new/${connector.manifest.id}`}
                className="shell-card p-5 transition hover:border-slate-400"
              >
                {content}
              </Link>
            ) : (
              <div
                key={connector.manifest.id}
                aria-disabled="true"
                className="shell-card p-5 opacity-70"
              >
                {content}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
