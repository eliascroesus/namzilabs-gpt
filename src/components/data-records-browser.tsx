"use client";

import { Database, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type DataRecordRow = {
  id: string;
  externalId: string;
  displayName: string | null;
  resourceType: string;
  status: string | null;
  occurredAt: string | null;
  sourceUpdatedAt: string | null;
  provider: string;
  connectionName: string;
};

function dateLabel(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function DataRecordsBrowser({ rows }: { rows: DataRecordRow[] }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const providers = useMemo(() => [...new Set(rows.map((row) => row.provider))].sort(), [rows]);
  const statuses = useMemo(
    () => [...new Set(rows.flatMap((row) => (row.status ? [row.status] : [])))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (provider !== "all" && row.provider !== provider) return false;
      if (status !== "all" && row.status !== status) return false;
      if (!normalizedQuery) return true;
      return [
        row.externalId,
        row.displayName,
        row.resourceType,
        row.connectionName,
        row.provider,
        row.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [provider, query, rows, status]);

  return (
    <section className="data-records-panel shell-card overflow-hidden">
      <div className="data-browser-toolbar">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Unified source records</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Search and inspect the latest synchronized records available to metrics.
          </p>
        </div>
        <span className="status-pill">{filtered.length} shown</span>
      </div>
      <div className="data-browser-filters">
        <label className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field-control search-control w-full"
            placeholder="Search IDs, people, resources, sources…"
          />
        </label>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          className="field-control"
          aria-label="Filter by provider"
        >
          <option value="all">All providers</option>
          {providers.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("-", " ")}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="field-control"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between border-y border-[var(--line)] bg-[var(--surface-2)] px-5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        <span>Latest synchronized data</span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={12} /> Tenant isolated
        </span>
      </div>
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table className="data-record-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Data object</th>
                <th>Connected source</th>
                <th>Record date</th>
                <th>Source updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="block max-w-64 truncate font-medium">
                      {row.displayName || row.externalId}
                    </span>
                    <span className="mt-1 block max-w-64 truncate font-mono text-[10px] text-[var(--muted)]">
                      {row.externalId}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="data-object-chip"
                      href={`/data?resourceType=${encodeURIComponent(row.resourceType)}`}
                    >
                      {row.resourceType.replaceAll(":", " / ")}
                    </Link>
                  </td>
                  <td>
                    <span className="font-medium">{row.connectionName}</span>
                    <span className="mt-1 block text-[10px] capitalize text-[var(--muted)]">
                      {row.provider.replaceAll("-", " ")}
                    </span>
                  </td>
                  <td className="text-[var(--muted)]">{dateLabel(row.occurredAt)}</td>
                  <td className="text-[var(--muted)]">{dateLabel(row.sourceUpdatedAt)}</td>
                  <td>
                    <span className="data-status-chip">{row.status ?? "available"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-6 py-16 text-center">
          <Database className="mx-auto text-[var(--muted)]" size={24} />
          <p className="mt-3 font-semibold">No records match these filters</p>
          <button
            type="button"
            className="text-button mt-3"
            onClick={() => {
              setQuery("");
              setProvider("all");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
