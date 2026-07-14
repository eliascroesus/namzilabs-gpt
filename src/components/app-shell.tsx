"use client";

import {
  Blocks,
  ChartNoAxesCombined,
  Database,
  Gauge,
  HelpCircle,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AppThemeProvider } from "@/components/app-theme";

const navigation = [
  { label: "Overview", href: "/overview", icon: Gauge },
  { label: "Dashboards", href: "/dashboards", icon: ChartNoAxesCombined },
  { label: "Metrics", href: "/metrics", icon: Sparkles },
  { label: "Data", href: "/data", icon: Database },
  { label: "Integrations", href: "/integrations", icon: Blocks },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppThemeProvider>
      <AppShellContent>{children}</AppShellContent>
    </AppThemeProvider>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const navigationPending = navigatingTo !== null && pathname !== navigatingTo;

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }
  return (
    <div className="app-shell-layout min-h-screen">
      {navigationPending ? <div className="app-route-progress" aria-hidden="true" /> : null}
      <aside className="app-sidebar">
        <Link href="/overview" className="app-sidebar-brand" aria-label="Namzilabs overview">
          <span aria-hidden="true">n.</span>
        </Link>
        <nav aria-label="Primary navigation" className="app-navigation">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              data-label={item.label}
              onClick={() => {
                if (pathname !== item.href) setNavigatingTo(item.href);
              }}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`app-nav-link ${
                pathname.startsWith(item.href) ? "app-nav-link-active" : ""
              } ${navigationPending && navigatingTo === item.href ? "app-nav-link-loading" : ""}`}
            >
              <item.icon size={19} aria-hidden="true" />
              <span className="sr-only">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom-navigation">
          <Link href="/terms" className="app-nav-link" title="Help" data-label="Help">
            <HelpCircle size={19} aria-hidden="true" />
            <span className="sr-only">Help</span>
          </Link>
          <Link
            href="/settings"
            className={`app-nav-link ${pathname.startsWith("/settings") ? "app-nav-link-active" : ""}`}
            title="Settings"
            data-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          >
            <Settings size={19} aria-hidden="true" />
            <span className="sr-only">Settings</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="app-nav-link sidebar-logout"
            title={signingOut ? "Signing out" : "Log out"}
            data-label={signingOut ? "Signing out…" : "Log out"}
          >
            <LogOut size={19} aria-hidden="true" />
            <span className="sr-only">{signingOut ? "Signing out…" : "Log out"}</span>
          </button>
        </div>
      </aside>
      <main
        className="app-main min-w-0 px-4 py-6 sm:px-7 lg:ml-[72px] lg:px-9 lg:py-8"
        aria-busy={navigationPending}
      >
        {children}
      </main>
    </div>
  );
}
