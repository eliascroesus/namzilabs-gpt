"use client";

import { CheckCircle2, LoaderCircle, Sheet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Sample = Record<string, unknown>;

export function GoogleSheetSetup({
  connectionId,
  initialConfiguration,
}: {
  connectionId: string;
  initialConfiguration: Record<string, unknown>;
}) {
  const [spreadsheetId, setSpreadsheetId] = useState(
    String(initialConfiguration.spreadsheetId ?? ""),
  );
  const [range, setRange] = useState(String(initialConfiguration.range ?? "A:Z"));
  const [uniqueKeyColumn, setUniqueKeyColumn] = useState(
    String(initialConfiguration.uniqueKeyColumn ?? ""),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[] | null>(null);

  async function saveAndPreview() {
    setLoading(true);
    setError(null);
    setSamples(null);
    try {
      const update = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configuration: {
            spreadsheetId: spreadsheetId.trim(),
            range: range.trim(),
            uniqueKeyColumn: uniqueKeyColumn.trim(),
            syncMode: "upsert",
          },
        }),
      });
      const updateBody = (await update.json()) as { error?: { message?: string } };
      if (!update.ok)
        throw new Error(updateBody.error?.message ?? "The configuration was not saved.");
      const preview = await fetch(`/api/connections/${connectionId}/samples`, {
        cache: "no-store",
      });
      const previewBody = (await preview.json()) as {
        data?: Sample[];
        error?: { message?: string };
      };
      if (!preview.ok)
        throw new Error(previewBody.error?.message ?? "Google did not return a preview.");
      setSamples(previewBody.data ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The spreadsheet could not be previewed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shell-card mt-6 p-5" aria-labelledby="google-sheet-setup-title">
      <div className="flex items-center gap-2">
        <Sheet size={17} className="text-[var(--brand)]" aria-hidden="true" />
        <h2 id="google-sheet-setup-title" className="font-bold">
          Choose the Google Sheet
        </h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Paste the spreadsheet ID from its URL. Namzi reads the selected range and never writes to
        the sheet.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold sm:col-span-2">
          Spreadsheet ID
          <input
            value={spreadsheetId}
            onChange={(event) => setSpreadsheetId(event.target.value)}
            placeholder="1AbC… from docs.google.com/spreadsheets/d/1AbC…"
            className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Range
          <input
            value={range}
            onChange={(event) => setRange(event.target.value)}
            placeholder="Leads!A:Z"
            className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Unique key column
          <input
            value={uniqueKeyColumn}
            onChange={(event) => setUniqueKeyColumn(event.target.value)}
            placeholder="Lead ID"
            className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal"
          />
        </label>
      </div>
      <Button
        className="mt-5"
        onClick={saveAndPreview}
        disabled={loading || !spreadsheetId.trim() || !uniqueKeyColumn.trim()}
      >
        {loading ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {loading ? "Reading Google Sheet…" : "Save and preview real rows"}
      </Button>
      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}
      {samples ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="border-b border-[var(--line)] bg-slate-50 px-4 py-3 text-xs font-semibold text-[var(--muted)]">
            {samples.length
              ? `${samples.length} genuine preview rows`
              : "Google returned no rows for this range"}
          </div>
          {samples.map((sample, index) => (
            <pre
              key={index}
              className="overflow-x-auto border-b border-[var(--line)] p-4 text-xs last:border-0"
            >
              {JSON.stringify(sample, null, 2)}
            </pre>
          ))}
        </div>
      ) : null}
    </section>
  );
}
