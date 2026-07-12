import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";

import { connectors } from "@/connectors/registry";

export const metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Data sources</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Connect the tools you already use
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Each source keeps its original payload, sync cursor, health and replay history.
          </p>
        </div>
        <Link
          href="/integrations/new/webhook"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
        >
          <Plus size={16} /> New connection
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {connectors.map((connector) => (
          <Link
            key={connector.manifest.id}
            href={`/integrations/new/${connector.manifest.id}`}
            className="shell-card group p-5 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand-dark)]">
                {connector.manifest.logo}
              </span>
              <ArrowRight
                size={17}
                className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-[var(--brand)]"
              />
            </div>
            <h2 className="mt-5 font-bold">{connector.manifest.name}</h2>
            <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">
              {connector.manifest.description}
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
          </Link>
        ))}
      </div>
    </div>
  );
}
