import { ArrowLeft, Clock3, Database, GitBranch, ListFilter } from "lucide-react";
import Link from "next/link";
import { DemoBanner } from "@/components/demo-banner";

export default function MetricDetailPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <DemoBanner />
      <Link
        href="/metrics"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={15} /> Metrics
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meetings booked</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Count of canonical meeting.booked activities.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          Version 1 · published
        </span>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <section className="shell-card p-5">
          <h2 className="font-bold">Plain-language definition</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Count activity facts where activity type equals meeting.booked, using occurred at for
            the selected reporting window.
          </p>
        </section>
        <section className="shell-card p-5">
          <h2 className="font-bold">Formula</h2>
          <code className="mt-3 block rounded-lg bg-slate-50 p-3 text-sm">count(records)</code>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Missing data shows no data. A zero count remains zero.
          </p>
        </section>
      </div>
      <section className="shell-card mt-4 p-5">
        <h2 className="font-bold">Provenance</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            [Database, "Dataset", "Canonical activity facts"],
            [ListFilter, "Filter", "activity_type = meeting.booked"],
            [Clock3, "Time field", "occurred_at · Europe/Stockholm"],
            [GitBranch, "Version behavior", "Dashboard cards stay on v1 until updated"],
          ].map(([Icon, label, value]) => {
            const ItemIcon = Icon as typeof Database;
            return (
              <div key={String(label)} className="flex gap-3">
                <ItemIcon size={17} className="mt-0.5 text-[var(--brand)]" />
                <div>
                  <dt className="text-xs text-[var(--muted)]">{String(label)}</dt>
                  <dd className="mt-1 text-sm font-semibold">{String(value)}</dd>
                </div>
              </div>
            );
          })}
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/data?activityType=meeting.booked"
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
          >
            View 47 matching records
          </Link>
          <Link
            href="/metrics/new"
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
          >
            Create draft version
          </Link>
        </div>
      </section>
    </div>
  );
}
