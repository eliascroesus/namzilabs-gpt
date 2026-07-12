"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Database,
  Info,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DemoBanner } from "@/components/demo-banner";
import { demoTrend, starterMetrics } from "@/lib/demo-data";

function MetricCard({ metric }: { metric: (typeof starterMetrics)[number] }) {
  const positive = metric.change >= 0;
  return (
    <article className="shell-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">{metric.name}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {"prefix" in metric ? metric.prefix : ""}
            {metric.value.toLocaleString()}
            {"suffix" in metric ? metric.suffix : ""}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
        >
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(metric.change)}%
        </span>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">vs. previous 30 days</p>
      <Link
        href={`/data?activityType=${metric.type}`}
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)]"
      >
        View matching records <ChevronRight size={13} />
      </Link>
    </article>
  );
}

export function AnalyticsOverview({ title = "Overview" }: { title?: string }) {
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setRefreshedAt(new Date());
    refresh();
    const interval = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const max = Math.max(...demoTrend);
  const points = demoTrend
    .map((value, index) => `${(index / (demoTrend.length - 1)) * 100},${92 - (value / max) * 78}`)
    .join(" ");
  return (
    <div className="mx-auto max-w-7xl">
      <DemoBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Unified operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            One traceable view of acquisition, conversations and revenue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="date-range">
            Date range
          </label>
          <select
            id="date-range"
            className="h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm"
            defaultValue="30"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
          </select>
          <label className="sr-only" htmlFor="timezone">
            Timezone
          </label>
          <select
            id="timezone"
            className="h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm"
            defaultValue="Europe/Stockholm"
          >
            <option>Europe/Stockholm</option>
            <option>UTC</option>
            <option>America/New_York</option>
          </select>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {starterMetrics.map((metric) => (
          <MetricCard key={metric.name} metric={metric} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
        <section className="shell-card p-5" aria-labelledby="meetings-trend">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="meetings-trend" className="font-bold">
                Meetings booked over time
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Daily · Calendly canonical activity
              </p>
            </div>
            <Link
              href="/metrics/meetings-booked"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)]"
            >
              <Info size={14} /> Definition
            </Link>
          </div>
          <svg
            className="mt-6 h-56 w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="Meetings booked increased from 12 to 47 over twelve periods"
          >
            {[20, 40, 60, 80].map((y) => (
              <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e4e9e6" strokeWidth="0.5" />
            ))}
            <polyline
              points={points}
              fill="none"
              stroke="#166b52"
              strokeWidth="2.2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <Link
            href="/data?activityType=meeting.booked"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)]"
          >
            View all 47 records <ChevronRight size={13} />
          </Link>
        </section>
        <section className="shell-card p-5" aria-labelledby="goal-title">
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <Target size={18} />
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              Off track
            </span>
          </div>
          <h2 id="goal-title" className="mt-5 font-bold">
            Monthly meeting goal
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">47 of 70 meetings</p>
          <div
            className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Monthly meeting goal"
            aria-valuemin={0}
            aria-valuemax={70}
            aria-valuenow={47}
          >
            <div className="h-full w-[67%] rounded-full bg-[var(--brand)]" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Remaining gap</p>
              <p className="mt-1 font-bold">23</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Expected today</p>
              <p className="mt-1 font-bold">55</p>
            </div>
          </div>
          <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-[var(--muted)]">
            On track means current value ≥ target × elapsed portion of the reporting period.
          </p>
          <Link
            href="/data?activityType=meeting.booked"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)]"
          >
            Inspect the gap <ChevronRight size={13} />
          </Link>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="shell-card p-5">
          <h2 className="font-bold">Lead-to-sale funnel</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Distinct people, first qualifying activity per stage
          </p>
          <div className="mt-5 space-y-4">
            {[
              ["Leads created", 184, 100],
              ["Meetings booked", 47, 26],
              ["Opportunities created", 21, 11],
              ["Opportunities won", 8, 4],
            ].map(([label, value, width], index) => (
              <div key={String(label)}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <Link href="/data" className="font-medium hover:text-[var(--brand)]">
                    {label}
                  </Link>
                  <span className="font-bold">{value}</span>
                </div>
                <div className="h-7 rounded-md bg-slate-100">
                  <div
                    className="flex h-7 min-w-8 items-center rounded-md bg-[var(--brand)] px-2 text-[10px] font-bold text-white"
                    style={{ width: `${width}%` }}
                  >
                    {index
                      ? `${Math.round((Number(value) / Number([184, 47, 21][index - 1])) * 100)}%`
                      : "100%"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="shell-card overflow-hidden">
          <div className="flex items-start justify-between p-5">
            <div>
              <h2 className="font-bold">Meetings by campaign</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Breakdown of matching records</p>
            </div>
            <Database size={18} className="text-[var(--muted)]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-[var(--line)] bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 font-medium">Meetings</th>
                  <th className="px-5 py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Nordic outbound", 22, "47%"],
                  ["US founders", 16, "34%"],
                  ["Inbound demo", 9, "19%"],
                ].map(([campaign, count, share]) => (
                  <tr
                    className="border-b border-[var(--line)] last:border-0"
                    key={String(campaign)}
                  >
                    <td className="px-5 py-3 font-medium">
                      <Link
                        href={`/data?campaign=${encodeURIComponent(String(campaign))}`}
                        className="hover:text-[var(--brand)]"
                      >
                        {campaign}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{count}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{share}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={13} /> Refreshed{" "}
          {refreshedAt ? refreshedAt.toLocaleTimeString() : "just now"}
          {" · "}polling every 20 seconds and on focus
        </span>
        <span>Calendly live · Close live · Instantly delayed 4m</span>
      </div>
    </div>
  );
}
