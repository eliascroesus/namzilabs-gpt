import { desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Plus, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { ConnectionCard } from "@/components/connection-card";
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Data sources
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connected apps</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Connect each account once. Choose its objects, spreadsheets, tabs, fields, and filters
            later when you build a metric.
          </p>
        </div>
        <Link href="/integrations/new/webhook" className="secondary-link">
          <Plus size={16} /> New webhook
        </Link>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Your connections</h2>
          <span className="status-pill">
            <Radio size={12} /> {rows.length} connected
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">
            No provider has been connected for this organization.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={{
                  id: connection.id,
                  name: connection.name,
                  provider: connection.provider,
                  accountName: connection.externalAccountName,
                  status: connection.status,
                  freshness: connection.freshness,
                  logo:
                    connectors.find((item) => item.manifest.id === connection.provider)?.manifest
                      .logo ?? "API",
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-9">
        <div>
          <h2 className="text-base font-semibold">Add an app</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Authorize an account here. Data selection happens inside the metric builder.
          </p>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {connectors.map((connector) => {
            const enabled = available(connector.manifest.id);
            const content = (
              <>
                <div className="flex items-start justify-between">
                  <span className="provider-mark size-11">{connector.manifest.logo}</span>
                  {enabled ? (
                    <ArrowRight
                      size={17}
                      className="text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-white"
                    />
                  ) : (
                    <AlertTriangle size={17} className="text-amber-600" />
                  )}
                </div>
                <h3 className="mt-5 font-semibold">{connector.manifest.name}</h3>
                <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">
                  {enabled
                    ? connector.manifest.description
                    : "Unavailable until this environment has an approved provider application and credentials."}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {connector.manifest.capabilities.slice(0, 3).map((capability) => (
                    <span
                      key={capability}
                      className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]"
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
                className="shell-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
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
      <div className="mt-8 flex items-center gap-2 text-xs text-[var(--muted)]">
        <ShieldCheck size={14} className="text-[var(--success)]" /> Credentials are encrypted; data
        access remains tenant-scoped and read-only where supported.
      </div>
    </div>
  );
}
