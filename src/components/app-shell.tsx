"use client";

import {
  Blocks,
  ChartNoAxesCombined,
  Database,
  Gauge,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const navigation = [
  { label: "Overview", href: "/overview", icon: Gauge },
  { label: "Dashboards", href: "/dashboards", icon: ChartNoAxesCombined },
  { label: "Metrics", href: "/metrics", icon: Sparkles },
  { label: "Data", href: "/data", icon: Database },
  { label: "Integrations", href: "/integrations", icon: Blocks },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--line)] bg-white px-4 py-4 lg:border-b-0 lg:border-r lg:py-5">
        <Link href="/" className="flex items-center gap-3 px-2 lg:mb-7">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">
            N
          </span>
          <span>
            <span className="block text-sm font-bold">Namzi Data</span>
            <span className="block text-xs text-[var(--muted)]">Unified operations</span>
          </span>
        </Link>
        <nav
          aria-label="Primary navigation"
          className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:mt-0 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
        >
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`flex shrink-0 items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                pathname.startsWith(item.href)
                  ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand-dark)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <span className="flex items-center gap-3">
                <item.icon size={17} aria-hidden="true" />
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
        <div className="mt-8 hidden rounded-xl border border-[var(--line)] bg-slate-50 p-3 text-xs leading-5 text-[var(--muted)] lg:block">
          Every metric is deterministic, versioned and traceable to its source records.
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-4 inline-flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50"
        >
          <LogOut size={17} aria-hidden="true" /> {signingOut ? "Signing out…" : "Log out"}
        </button>
      </aside>
      <main className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
