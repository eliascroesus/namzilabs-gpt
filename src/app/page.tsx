import {
  ArrowRight,
  Blocks,
  Check,
  ChartNoAxesCombined,
  DatabaseZap,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import Link from "next/link";

import { PublicFooter, PublicHeader } from "@/components/public-site";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f8faf9]">
      <PublicHeader />
      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_.95fr] lg:pt-24">
          <div>
            <span className="inline-flex rounded-full bg-[var(--brand-soft)] px-3 py-1 text-sm font-semibold text-[var(--brand-dark)]">
              One reliable view of your operations
            </span>
            <h1 className="mt-6 max-w-2xl text-5xl font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl">
              Your business data, finally in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
              Namzi Data brings Calendly, Google Sheets, Close, Instantly, Brevo and secure webhooks
              into one traceable analytics workspace. Every number links back to the records that
              produced it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/overview"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white"
              >
                Open your workspace <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <span className="inline-flex h-11 items-center gap-2 px-2 text-sm text-[var(--muted)]">
                <ShieldCheck size={17} aria-hidden="true" /> Read-only integrations by design
              </span>
            </div>
            <p className="mt-5 max-w-xl text-xs leading-5 text-[var(--muted)]">
              By using Namzi Data, you agree to our{" "}
              <Link href="/terms" className="font-semibold underline">
                Terms
              </Link>{" "}
              and acknowledge our{" "}
              <Link href="/privacy" className="font-semibold underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div className="shell-card overflow-hidden p-3">
            <div className="rounded-xl bg-[#17231f] p-6 text-white">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Reliable by construction</span>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-300">
                  Traceable
                </span>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  ["Source data", "Original provider meaning preserved", "Stored"],
                  ["Metric definition", "Deterministic and versioned", "Visible"],
                  ["Record drill-down", "Inspect what produced every result", "Linked"],
                ].map(([name, detail, status]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-xl bg-white/7 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">{name}</div>
                      <div className="mt-0.5 text-xs text-white/55">{detail}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <Check size={14} aria-hidden="true" /> {status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-3">
              {[
                [DatabaseZap, "Raw data retained"],
                [Workflow, "Automatic retries"],
                [ShieldCheck, "Tenant isolated"],
              ].map(([Icon, label]) => {
                const FeatureIcon = Icon as typeof DatabaseZap;
                return (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-[var(--line)] p-3 text-sm"
                  >
                    <FeatureIcon
                      size={17}
                      className="mb-2 text-[var(--brand)]"
                      aria-hidden="true"
                    />
                    {String(label)}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--line)] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-[var(--brand)]">Calm, not chaotic</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                One operating picture, with the evidence attached.
              </h2>
            </div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {[
                [
                  Blocks,
                  "Connect",
                  "Bring your business systems together through OAuth, API keys or authenticated webhooks.",
                ],
                [
                  ChartNoAxesCombined,
                  "Measure",
                  "Build transparent KPIs, conversion rates, funnels and goals without customer-written SQL.",
                ],
                [
                  DatabaseZap,
                  "Verify",
                  "Drill from every dashboard value into the matching masked source records and freshness status.",
                ],
              ].map(([Icon, title, description]) => {
                const FeatureIcon = Icon as typeof Blocks;
                return (
                  <article
                    key={String(title)}
                    className="rounded-xl border border-[var(--line)] p-5"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                      <FeatureIcon size={19} aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 font-bold">{String(title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {String(description)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="rounded-2xl bg-[var(--brand)] px-6 py-10 text-white sm:px-10 sm:py-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-100">
                  Built for operational clarity
                </p>
                <h2 className="mt-2 max-w-2xl text-3xl font-bold">
                  See the bottleneck. Open the records. Fix the process.
                </h2>
              </div>
              <Link
                href="/integrations"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[var(--brand-dark)]"
              >
                View integrations <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
