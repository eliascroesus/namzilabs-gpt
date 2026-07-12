"use client";

import { Download, Eye, Filter, Search, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DemoBanner } from "@/components/demo-banner";
import { demoActivities } from "@/lib/demo-data";

const PAGE_SIZE = 4;

export function DataExplorer() {
  const params = useSearchParams();
  const [dataset, setDataset] = useState("canonical");
  const [search, setSearch] = useState("");
  const [activityType, setActivityType] = useState(params.get("activityType") ?? "all");
  const [page, setPage] = useState(0);
  const [exported, setExported] = useState(false);
  const filtered = useMemo(
    () =>
      demoActivities.filter(
        (row) =>
          (activityType === "all" || row.type === activityType) &&
          [row.id, row.contact, row.campaign, row.source, row.status]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [activityType, search],
  );
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <div className="mx-auto max-w-7xl">
      <DemoBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">Trace every number</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Data explorer</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Sensitive identifiers stay masked until an authorized administrator reveals them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExported(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold"
        >
          <Download size={16} /> Queue export
        </button>
      </div>
      {exported && (
        <div
          role="status"
          className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          Fixture export queued. Production exports run as audited background jobs.
        </div>
      )}
      <div
        className="mt-6 flex gap-1 overflow-x-auto border-b border-[var(--line)]"
        role="tablist"
        aria-label="Data layer"
      >
        {(
          [
            ...[
              ["raw", "Raw events"],
              ["source", "Source records"],
              ["canonical", "Canonical activities"],
            ],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={dataset === value}
            onClick={() => setDataset(value)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${dataset === value ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--muted)]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">Search records</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search visible fields"
            className="h-10 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-sm"
          />
        </label>
        <label className="relative">
          <span className="sr-only">Activity type</span>
          <Filter size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <select
            value={activityType}
            onChange={(event) => {
              setActivityType(event.target.value);
              setPage(0);
            }}
            className="h-10 rounded-lg border border-[var(--line)] bg-white pl-9 pr-8 text-sm"
          >
            <option value="all">All activities</option>
            {[...new Set(demoActivities.map((row) => row.type))].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Start date</span>
          <input
            type="date"
            defaultValue="2026-06-12"
            className="h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">End date</span>
          <input
            type="date"
            defaultValue="2026-07-11"
            className="h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm"
          />
        </label>
      </div>
      <div className="shell-card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]">
          <span>
            {filtered.length} matching records · {dataset.replaceAll("_", " ")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} /> Email and phone masked
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Record</th>
                <th className="px-5 py-3 font-medium">Activity</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Occurred</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="px-5 py-3 font-mono text-xs">{row.id}</td>
                  <td className="px-5 py-3 font-medium">{row.type}</td>
                  <td className="px-5 py-3">
                    {row.contact}
                    <span className="block text-[10px] text-[var(--muted)]">••••@••••.com</span>
                  </td>
                  <td className="px-5 py-3">{row.campaign}</td>
                  <td className="px-5 py-3">{row.source}</td>
                  <td className="px-5 py-3">
                    {new Date(row.occurredAt).toLocaleString("en-SE", {
                      timeZone: "Europe/Stockholm",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      aria-label={`Inspect ${row.id}`}
                      className="grid size-8 place-items-center rounded-md border border-[var(--line)]"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <p className="font-semibold">No matching records</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Clear a filter or choose a wider date range.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 text-xs">
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={(page + 1) * PAGE_SIZE >= filtered.length}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
