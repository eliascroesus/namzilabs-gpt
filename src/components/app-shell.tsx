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

import { BrandWordmark } from "@/components/brand-wordmark";

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_80%_-20%,rgba(97,78,220,.13),transparent_34%)]">
      <aside className="app-sidebar">
        <Link href="/overview" className="app-sidebar-brand" aria-label="Namzilabs overview">
          <span className="sidebar-compact-brand">
            <BrandWordmark compact />
          </span>
          <span className="sidebar-reveal">
            <BrandWordmark />
          </span>
        </Link>
        <div className="sidebar-section-label">
          <Activity size={11} /> Workspace
        </div>
        <nav aria-label="Primary navigation" className="app-navigation">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`app-nav-link ${
                pathname.startsWith(item.href) ? "app-nav-link-active" : ""
              }`}
            >
              <item.icon size={19} aria-hidden="true" />
              <span className="sidebar-nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-health sidebar-reveal">
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
          className="app-nav-link sidebar-logout"
          title="Log out"
        >
          <LogOut size={19} aria-hidden="true" />
          <span className="sidebar-nav-label">{signingOut ? "Signing out…" : "Log out"}</span>
        </button>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-7 lg:ml-[76px] lg:px-9 lg:py-8">{children}</main>
    </div>
  );
}
