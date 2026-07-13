import { GitMerge, LockKeyhole, ShieldCheck } from "lucide-react";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { ThemeSettings } from "@/components/theme-settings";
import { identityReviewQueue, organizations } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";
import { roleRank } from "@/server/auth/authorization";
import { operationsSnapshot } from "@/server/operations/service";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const tenant = await requireTenantContext();
  const db = getDb();
  const [[organization], [reviewCount]] = await Promise.all([
    db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, tenant.organizationId))
      .limit(1),
    db
      .select({ value: count() })
      .from(identityReviewQueue)
      .where(
        and(
          eq(identityReviewQueue.organizationId, tenant.organizationId),
          eq(identityReviewQueue.status, "pending"),
        ),
      ),
  ]);
  const operations =
    roleRank[tenant.role] >= roleRank.admin
      ? await operationsSnapshot(db, tenant.organizationId)
      : null;
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-semibold text-[var(--brand)]">Workspace controls</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Timezone, identity review and data permissions.
      </p>
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        <ThemeSettings />
        <section className="shell-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <GitMerge size={18} />
            </span>
            <div>
              <h2 className="font-bold">Identity review queue</h2>
              <p className="text-xs text-[var(--muted)]">Exact signals that disagree</p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-6 text-center">
            <p className="text-sm font-semibold">
              {Number(reviewCount?.value ?? 0) === 0
                ? "No ambiguous identities"
                : `${Number(reviewCount?.value ?? 0)} identities require review`}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Calendly and CRM contacts are never merged by fuzzy similarity. Conflicting exact
              identifiers will appear here for an administrator.
            </p>
          </div>
        </section>
        <section className="shell-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <LockKeyhole size={18} />
            </span>
            <div>
              <h2 className="font-bold">Data permissions</h2>
              <p className="text-xs text-[var(--muted)]">Role-based access</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            {[
              "Owners and admins can review raw payloads",
              "Editors can build and publish metrics",
              "Viewers can inspect masked matching records",
              "Exports require editor access and create an audit event",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="shell-card p-5 lg:col-span-2">
          <h2 className="font-bold">Reporting timezone</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            All dashboard windows and date buckets use this IANA timezone.
          </p>
          <div className="mt-5 max-w-sm rounded-lg border border-[var(--line)] bg-slate-50 px-4 py-3 text-sm font-semibold">
            {organization?.timezone ?? "UTC"}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Daylight-saving transitions are calculated at local calendar boundaries, then stored and
            queried in UTC. Timezone changes are an audited administrator operation and are not
            exposed until that workflow is implemented.
          </p>
        </section>
        <section className="shell-card p-5 lg:col-span-2">
          <h2 className="font-bold">Service objective evidence</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Rolling 24-hour internal measurements. Unmeasured objectives never display as passing.
          </p>
          {operations ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {Object.entries(operations.objectives).map(([name, objective]) => (
                <div key={name} className="rounded-xl border border-[var(--line)] p-4">
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    {name.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 text-xl font-bold">
                    {objective.p95 === null ? "Unmeasured" : `${objective.p95.toFixed(1)} ms`}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    p95 target ≤ {objective.target.toLocaleString()} ms · {objective.samples}{" "}
                    samples
                  </p>
                </div>
              ))}
              <div className="rounded-xl border border-[var(--line)] p-4 sm:col-span-3">
                <p className="text-xs font-semibold text-[var(--muted)]">Durable processing</p>
                <p className="mt-2 text-sm">
                  {operations.events.pending} raw events pending · queue depth{" "}
                  {operations.queue.depth}
                  {operations.queue.oldestPendingSeconds === null
                    ? ""
                    : ` · oldest queued ${Math.round(operations.queue.oldestPendingSeconds)}s`}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Provider page requests {operations.providers.requests} · error rate{" "}
                  {operations.providers.errorRate === null
                    ? "unmeasured"
                    : `${(operations.providers.errorRate * 100).toFixed(2)}%`}
                  {" · "}OAuth refresh failures {operations.providers.oauthRefreshFailures} ·
                  reconciliation repairs {operations.providers.reconciliationRepairs}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-[var(--muted)]">
              Administrator access is required to inspect operational measurements.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
