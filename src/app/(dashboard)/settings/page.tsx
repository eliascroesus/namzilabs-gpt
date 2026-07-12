import { GitMerge, LockKeyhole, ShieldCheck } from "lucide-react";

export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-semibold text-[var(--brand)]">Workspace controls</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Timezone, identity review and data permissions.
      </p>
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
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
            <p className="text-sm font-semibold">No ambiguous identities</p>
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
          <label htmlFor="workspace-timezone" className="mt-5 block text-sm font-medium">
            Workspace timezone
          </label>
          <select
            id="workspace-timezone"
            defaultValue="Europe/Stockholm"
            className="mt-2 h-11 w-full max-w-sm rounded-lg border border-[var(--line)] bg-white px-3 text-sm"
          >
            <option>Europe/Stockholm</option>
            <option>UTC</option>
            <option>America/New_York</option>
          </select>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Daylight-saving transitions are calculated at local calendar boundaries, then stored and
            queried in UTC.
          </p>
        </section>
      </div>
    </div>
  );
}
