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
import { getProviderPresentation } from "@/lib/provider-presentation";

const navigation = [
  { label: "Overview", href: "/overview", icon: Gauge },
  { label: "Dashboards", href: "/dashboards", icon: ChartNoAxesCombined },
  { label: "Metrics", href: "/metrics", icon: Sparkles },
  { label: "Data", href: "/data", icon: Database },
  { label: "Integrations", href: "/integrations", icon: Blocks },
];

export type AppShellSource = {
  id: string;
  provider: string;
  name: string;
  status: string;
  freshness: string;
};

export function AppShell({
  children,
  sources = [],
}: {
  children: ReactNode;
  sources?: AppShellSource[];
}) {
  return (
    <AppThemeProvider>
      <AppShellContent sources={sources}>{children}</AppShellContent>
    </AppThemeProvider>
  );
}

function AppShellContent({
  children,
  sources,
}: {
  children: ReactNode;
  sources: AppShellSource[];
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const navigationPending = navigatingTo !== null && pathname !== navigatingTo;
  const activePage =
    navigation.find((item) => pathname.startsWith(item.href))?.label ??
    (pathname.startsWith("/settings") ? "Settings" : "Workspace");

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
      <aside className="app-sidebar">
        <Link href="/overview" className="app-sidebar-brand" aria-label="Namzilabs overview">
          <span className="app-sidebar-wordmark" aria-hidden="true">
            namzilabs<span>.</span>
          </span>
        </Link>
        <p className="app-nav-section">Workspace</p>
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
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        {sources.length ? (
          <div className="app-sidebar-sources">
            <p className="app-nav-section">Sources</p>
            <div className="app-source-list">
              {sources.map((source) => {
                const provider = getProviderPresentation(source.provider);
                const healthy = source.status === "active" && source.freshness !== "delayed";
                return (
                  <Link
                    key={source.id}
                    href={`/integrations/${source.id}`}
                    className="app-source-link"
                    title={`${provider.label}: ${source.name}`}
                  >
                    <span
                      className="app-source-mark"
                      style={{ color: provider.color, borderColor: `${provider.color}55` }}
                    >
                      {provider.shortLabel}
                    </span>
                    <span className="app-source-name">{provider.label}</span>
                    <span
                      className={`app-source-status ${healthy ? "healthy" : "attention"}`}
                      style={{ backgroundColor: healthy ? provider.color : undefined }}
                      aria-label={healthy ? "Connected" : "Needs attention"}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="sidebar-bottom-navigation">
          <p className="app-nav-section">Account</p>
          <Link href="/terms" className="app-nav-link" title="Help" data-label="Help">
            <HelpCircle size={19} aria-hidden="true" />
            <span>Help</span>
          </Link>
          <Link
            href="/settings"
            className={`app-nav-link ${pathname.startsWith("/settings") ? "app-nav-link-active" : ""}`}
            title="Settings"
            data-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          >
            <Settings size={19} aria-hidden="true" />
            <span>Settings</span>
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
            <span>{signingOut ? "Signing out…" : "Log out"}</span>
          </button>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="app-breadcrumb">
            <span>Dashboard</span>
            <span aria-hidden="true">/</span>
            <strong>{activePage}</strong>
          </div>
        </header>
        <main className="app-main min-w-0" aria-busy={navigationPending}>
          {children}
        </main>
      </div>
    </div>
  );
}
