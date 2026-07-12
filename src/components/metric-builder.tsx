"use client";

import { ArrowLeft, ArrowRight, Check, Filter, Save } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DemoBanner } from "@/components/demo-banner";
import { demoActivities } from "@/lib/demo-data";

const steps = ["Measure", "Calculate", "Filter", "Organize", "Preview", "Save"];
const activityOptions = [
  ["meeting.booked", "Meetings booked"],
  ["meeting.canceled", "Meetings canceled"],
  ["call.completed", "Calls completed"],
  ["email.sent", "Emails sent"],
  ["email.replied", "Email replies"],
  ["opportunity.won", "Opportunities won"],
] as const;

export function MetricBuilder() {
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("meeting.booked");
  const [calculation, setCalculation] = useState("count");
  const [campaign, setCampaign] = useState("all");
  const [groupBy, setGroupBy] = useState("none");
  const [name, setName] = useState("Meetings booked");
  const [saved, setSaved] = useState(false);
  const matching = useMemo(
    () =>
      demoActivities.filter(
        (row) => row.type === activity && (campaign === "all" || row.campaign === campaign),
      ),
    [activity, campaign],
  );
  const value =
    calculation === "sum"
      ? matching.reduce((total, row) => total + ("amount" in row ? Number(row.amount) : 0), 0)
      : matching.length;
  const definition = {
    dataset: "activity_facts",
    measure: { operation: calculation, ...(calculation === "sum" ? { field: "amount" } : {}) },
    filters: [{ field: "activity_type", operator: "equals", value: activity }],
    timeField: "occurred_at",
    groupBy: groupBy === "none" ? [] : [groupBy],
  };
  const next = () => setStep((current) => Math.min(steps.length - 1, current + 1));
  const previous = () => setStep((current) => Math.max(0, current - 1));
  return (
    <div className="mx-auto max-w-4xl">
      <DemoBanner />
      <Link
        href="/metrics"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft size={15} /> Metrics
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Build a metric</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        A short, deterministic definition. No SQL and no hidden calculation.
      </p>
      <ol
        className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-6"
        aria-label="Metric builder progress"
      >
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
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
      <section className="shell-card mt-5 min-h-96 p-6 sm:p-8">
        {step === 0 && (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">
              What do you want to measure?
            </p>
            <h2 className="mt-2 text-2xl font-bold">Choose a canonical activity</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {activityOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setActivity(value);
                    setName(label);
                  }}
                  className={`rounded-xl border p-4 text-left transition ${activity === value ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] hover:border-slate-400"}`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    activity_type equals {value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Choose a calculation</p>
            <h2 className="mt-2 text-2xl font-bold">How should records become a number?</h2>
            <fieldset className="mt-6 space-y-3">
              <legend className="sr-only">Calculation</legend>
              {(
                [
                  ...[
                    ["count", "Count records", "One for every matching record"],
                    ["distinct_count", "Distinct count", "Count each person once"],
                    ["sum", "Sum amount", "Add the promoted numeric amount"],
                  ],
                ] as const
              ).map(([value, label, detail]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${calculation === value ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}
                >
                  <input
                    className="mt-1 accent-[var(--brand)]"
                    type="radio"
                    name="calculation"
                    value={value}
                    checked={calculation === value}
                    onChange={() => setCalculation(value)}
                  />
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">{detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}
        {step === 2 && (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Optional filters</p>
            <h2 className="mt-2 text-2xl font-bold">Which records should count?</h2>
            <div className="mt-6 rounded-xl border border-[var(--line)] p-5">
              <div className="flex items-center gap-2 font-semibold">
                <Filter size={16} /> Campaign
              </div>
              <label
                htmlFor="campaign"
                className="mt-4 block text-xs font-medium text-[var(--muted)]"
              >
                is equal to
              </label>
              <select
                id="campaign"
                value={campaign}
                onChange={(event) => setCampaign(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3"
              >
                <option value="all">Any campaign</option>
                <option>Nordic outbound</option>
                <option>US founders</option>
              </select>
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              More AND/OR groups are available after saving under Advanced. This default path stays
              intentionally short.
            </p>
          </div>
        )}
        {step === 3 && (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Time and grouping</p>
            <h2 className="mt-2 text-2xl font-bold">How should results be organized?</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Time field
                <select className="mt-2 block h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3">
                  <option>Occurred at</option>
                  <option>Created at</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Group by
                <select
                  value={groupBy}
                  onChange={(event) => setGroupBy(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3"
                >
                  <option value="none">No grouping</option>
                  <option value="campaign_id">Campaign</option>
                  <option value="channel">Channel</option>
                  <option value="owner_id">Owner</option>
                </select>
              </label>
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm">
              <span className="font-semibold">Timezone:</span> Europe/Stockholm · date boundaries
              include start and exclude end.
            </div>
          </div>
        )}
        {step === 4 && (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">
              Preview against matching data
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[.7fr_1.3fr]">
              <div className="rounded-xl bg-[#17231f] p-5 text-white">
                <p className="text-xs text-white/60">Preview result</p>
                <p className="mt-3 text-4xl font-bold">{value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-white/60">
                  {matching.length} matching underlying records
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] p-5">
                <h2 className="font-bold">Plain-language definition</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {calculation.replaceAll("_", " ")} of {activity.replaceAll(".", " ")}
                  {campaign !== "all" ? ` where campaign is ${campaign}` : ""}
                  {groupBy !== "none" ? `, grouped by ${groupBy.replaceAll("_", " ")}` : ""}.
                </p>
                <dl className="mt-4 grid grid-cols-[100px_1fr] gap-y-2 text-xs">
                  <dt className="text-[var(--muted)]">Formula</dt>
                  <dd>
                    {calculation}({calculation === "sum" ? "amount" : "records"})
                  </dd>
                  <dt className="text-[var(--muted)]">Source</dt>
                  <dd>Canonical activity facts</dd>
                  <dt className="text-[var(--muted)]">Excluded</dt>
                  <dd>{demoActivities.length - matching.length} fixture records</dd>
                  <dt className="text-[var(--muted)]">Freshness</dt>
                  <dd>Calendly live</dd>
                </dl>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[var(--muted)]">
                  <tr>
                    <th className="p-3">Record</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3">Campaign</th>
                    <th className="p-3">Occurred</th>
                  </tr>
                </thead>
                <tbody>
                  {matching.slice(0, 3).map((row) => (
                    <tr key={row.id} className="border-t border-[var(--line)]">
                      <td className="p-3 font-mono">{row.id}</td>
                      <td className="p-3">{row.contact}</td>
                      <td className="p-3">{row.campaign}</td>
                      <td className="p-3">{new Date(row.occurredAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {step === 5 && (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Name and publish</p>
            <h2 className="mt-2 text-2xl font-bold">Make this metric easy to recognize</h2>
            <label htmlFor="metric-name" className="mt-6 block text-sm font-medium">
              Metric name
            </label>
            <input
              id="metric-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] px-3"
            />
            <label htmlFor="metric-description" className="mt-5 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="metric-description"
              className="mt-2 min-h-24 w-full rounded-lg border border-[var(--line)] p-3"
              defaultValue="A traceable operating metric built from canonical activity data."
            />
            <details className="mt-5 rounded-lg border border-[var(--line)] p-4 text-xs">
              <summary className="cursor-pointer font-semibold">
                Review deterministic definition
              </summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--muted)]">
                {JSON.stringify(definition, null, 2)}
              </pre>
            </details>
            {saved && (
              <div
                role="status"
                className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
              >
                Metric version 1 published. Dashboard cards will remain pinned to this version.
              </div>
            )}
          </div>
        )}
      </section>
      <div className="mt-5 flex justify-between">
        <button
          type="button"
          onClick={previous}
          disabled={step === 0}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold disabled:opacity-40"
        >
          <ArrowLeft size={15} /> Back
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSaved(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            <Save size={15} /> Publish metric
          </button>
        )}
      </div>
    </div>
  );
}
