import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { DemoBanner } from "@/components/demo-banner";
import { starterMetrics } from "@/lib/demo-data";

export const metadata = { title: "Metrics" };
export default function MetricsPage() {
  const templates = [
    "Meetings booked",
    "Booking cancellation rate",
    "Calls completed",
    "Emails sent",
    "Email reply rate",
    "Positive replies",
    "Opportunities created",
    "Close rate",
    "Revenue won",
    "Lead-to-booking conversion",
    "Booking-to-sale conversion",
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <DemoBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Deterministic definitions</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Metrics</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Every number has a formula, immutable version and matching records.
          </p>
        </div>
        <Link
          href="/metrics/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Build metric
        </Link>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {starterMetrics.map((metric) => (
          <Link
            key={metric.name}
            href="/metrics/meetings-booked"
            className="shell-card p-5 transition hover:border-slate-400"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 text-[10px] font-bold text-[var(--brand-dark)]">
                v1 published
              </span>
              <ArrowRight size={15} className="text-slate-400" />
            </div>
            <h2 className="mt-5 font-bold">{metric.name}</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{metric.description}</p>
            <div className="mt-4 flex items-center gap-1 text-[11px] text-[var(--muted)]">
              <ShieldCheck size={13} /> Parameterized · traceable
            </div>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <h2 className="text-lg font-bold">Start from a template</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Templates create normal, editable definitions with no hidden behavior.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {templates.map((template) => (
            <Link
              key={template}
              href="/metrics/new"
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium hover:border-[var(--brand)]"
            >
              {template}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
