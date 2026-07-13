"use client";

import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const steps = ["Measure", "Calculate", "Organize", "Preview", "Save"];
const activityOptions = [
  ["meeting.booked", "Meetings booked"],
  ["meeting.canceled", "Meetings canceled"],
  ["call.completed", "Calls completed"],
  ["email.sent", "Emails sent"],
  ["email.replied", "Email replies"],
  ["opportunity.won", "Opportunities won"],
] as const;
type Calculation = "count" | "distinct_count" | "sum";

export function MetricBuilder() {
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("meeting.booked");
  const [calculation, setCalculation] = useState<Calculation>("count");
  const [groupBy, setGroupBy] = useState("none");
  const [name, setName] = useState("Meetings booked");
  const [preview, setPreview] = useState<{
    rows: Record<string, unknown>[];
    matchingCount: number;
    durationMs: number;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const definition = useMemo(
    () => ({
      dataset: "activity_facts",
      measure:
        calculation === "count"
          ? { operation: "count" }
          : {
              operation: calculation,
              field: calculation === "sum" ? "amount" : "person_id",
            },
      filters: [{ field: "activity_type", operator: "equals", value: activity }],
      timeField: "occurred_at",
      groupBy: groupBy === "none" ? [] : [groupBy],
      comparison: "none",
    }),
    [activity, calculation, groupBy],
  );

  async function loadPreview() {
    setWorking(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86_400_000);
      const response = await fetch("/api/metrics/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition,
          window: {
            start: start.toISOString(),
            end: end.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          },
        }),
      });
      const result = (await response.json()) as {
        data?: { rows: Record<string, unknown>[]; matchingCount: number; durationMs: number };
        error?: { message?: string };
      };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Preview failed.");
      setPreview(result.data);
      setStep(3);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview failed.");
    } finally {
      setWorking(false);
    }
  }

  async function publishMetric() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, definition }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "The metric could not be saved.");
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The metric could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  const previewValue = preview?.rows[0]?.value;
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/metrics"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={15} /> Metrics
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Build a metric</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Preview and publish a deterministic definition against genuine tenant data.
      </p>
      <ol className="mt-7 grid grid-cols-5 gap-2" aria-label="Metric builder progress">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-lg px-2 py-2 text-center text-xs font-semibold ${step === index ? "bg-[var(--brand)] text-white" : index < step ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]" : "bg-slate-100 text-slate-500"}`}
          >
            {index < step ? (
              <Check className="mx-auto mb-1" size={13} />
            ) : (
              <span className="mb-1 block">{index + 1}</span>
            )}
            {label}
          </li>
        ))}
      </ol>
      <section className="shell-card mt-5 min-h-80 p-6 sm:p-8">
        {step === 0 ? (
          <div>
            <h2 className="text-2xl font-bold">Choose a canonical activity</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {activityOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setActivity(value);
                    setName(label);
                  }}
                  className={`rounded-xl border p-4 text-left ${activity === value ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    activity_type = {value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <div>
            <h2 className="text-2xl font-bold">Choose a calculation</h2>
            <div className="mt-6 space-y-3">
              {(["count", "distinct_count", "sum"] as const).map((value) => (
                <label
                  key={value}
                  className="flex gap-3 rounded-xl border border-[var(--line)] p-4"
                >
                  <input
                    type="radio"
                    checked={calculation === value}
                    onChange={() => setCalculation(value)}
                  />
                  <span className="font-semibold capitalize">{value.replaceAll("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div>
            <h2 className="text-2xl font-bold">Choose optional grouping</h2>
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value)}
              className="mt-6 h-11 w-full max-w-sm rounded-lg border border-[var(--line)] bg-white px-3"
            >
              <option value="none">No grouping</option>
              <option value="campaign_id">Campaign</option>
              <option value="channel">Channel</option>
              <option value="owner_id">Owner</option>
            </select>
            <p className="mt-4 text-xs text-[var(--muted)]">
              The preview uses the previous 30 days and the browser’s IANA timezone.
            </p>
          </div>
        ) : null}
        {step === 3 ? (
          <div>
            <h2 className="text-2xl font-bold">Real-data preview</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-950 p-5 text-white">
                <p className="text-xs text-white/60">Result</p>
                <p className="mt-2 text-3xl font-bold">
                  {previewValue === null || previewValue === undefined
                    ? "No data"
                    : String(previewValue)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] p-5">
                <p className="text-xs text-[var(--muted)]">Matching records</p>
                <p className="mt-2 text-3xl font-bold">{preview?.matchingCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] p-5">
                <p className="text-xs text-[var(--muted)]">Query time</p>
                <p className="mt-2 text-3xl font-bold">
                  {preview ? `${preview.durationMs.toFixed(1)} ms` : "—"}
                </p>
              </div>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-50 p-4 text-xs">
              {JSON.stringify(definition, null, 2)}
            </pre>
          </div>
        ) : null}
        {step === 4 ? (
          <div>
            <h2 className="text-2xl font-bold">Publish immutable version 1</h2>
            <label className="mt-6 block text-sm font-semibold">
              Metric name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal"
              />
            </label>
            {saved ? (
              <div
                role="status"
                className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
              >
                Metric version 1 was published from the previewed definition.{" "}
                <Link href="/metrics" className="underline">
                  View metrics
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </section>
      <div className="mt-5 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0 || working}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold disabled:opacity-40"
        >
          <ArrowLeft size={15} /> Back
        </button>
        {step < 2 ? (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            Continue <ArrowRight size={15} />
          </button>
        ) : step === 2 ? (
          <button
            type="button"
            onClick={loadPreview}
            disabled={working}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {working ? "Querying…" : "Preview real data"} <ArrowRight size={15} />
          </button>
        ) : step === 3 ? (
          <button
            type="button"
            onClick={() => setStep(4)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={publishMetric}
            disabled={working || saved}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save size={15} /> {working ? "Publishing…" : "Publish metric"}
          </button>
        )}
      </div>
    </div>
  );
}
