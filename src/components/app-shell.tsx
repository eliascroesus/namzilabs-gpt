"use client";

import {
  Blocks,
  ChartNoAxesCombined,
  Database,
  Gauge,
  LogOut,
  Settings,
  Sparkles,
  Activity,
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_80%_-20%,rgba(97,78,220,.13),transparent_34%)] lg:grid lg:grid-cols-[238px_1fr]">
      <aside className="border-b border-[var(--line)] bg-[#0b0e13]/95 px-3 py-3 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:py-4">
        <Link href="/overview" className="flex items-center gap-3 px-2 lg:mb-7">
          <span className="grid size-9 place-items-center rounded-lg border border-[#7769e5] bg-gradient-to-br from-[#7868f2] to-[#4f3fc4] text-sm font-black text-white shadow-[0_8px_28px_rgba(91,70,220,.3)]">
            N/
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">Namzi Data</span>
            <span className="block text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
              Metrics engine
            </span>
          </span>
        </Link>
        <div className="mb-3 hidden items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5e6675] lg:flex">
          <Activity size={11} /> Workspace
        </div>
        <nav
          aria-label="Primary navigation"
          className="mt-4 grid grid-cols-3 gap-1 pb-1 lg:mt-0 lg:block lg:space-y-1 lg:pb-0"
        >
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`flex min-w-0 items-center justify-center rounded-lg border px-2 py-2.5 text-[12px] transition lg:justify-between lg:px-3 lg:text-[13px] ${
                pathname.startsWith(item.href)
                  ? "border-[#3a315f] bg-[#1a1730] font-semibold text-white"
                  : "border-transparent text-[#8992a2] hover:bg-[#141820] hover:text-white"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 lg:gap-3">
                <item.icon size={17} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="mt-8 hidden rounded-xl border border-[var(--line)] bg-[#11151c] p-3 text-xs leading-5 text-[var(--muted)] lg:block">
          <span className="mb-2 flex items-center gap-2 font-semibold text-[#cbd1dc]">
            <span className="size-1.5 rounded-full bg-[var(--success)] shadow-[0_0_10px_var(--success)]" />
            Data systems online
          </span>
          Metrics stay traceable to source records and published definitions.
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-4 inline-flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#7f899a] hover:bg-[#141820] hover:text-white disabled:opacity-50"
        >
          <LogOut size={17} aria-hidden="true" /> {signingOut ? "Signing out…" : "Log out"}
        </button>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</main>
    </div>
  );
}
