import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";

import { AppShell, type AppShellSource } from "@/components/app-shell";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { requireTenantContext } from "@/server/auth/tenant";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const tenant = await requireTenantContext();
  let sources: AppShellSource[] = [];
  try {
    sources = await getDb()
      .select({
        id: connections.id,
        provider: connections.provider,
        name: connections.name,
        status: connections.status,
        freshness: connections.freshness,
      })
      .from(connections)
      .where(eq(connections.organizationId, tenant.organizationId));
  } catch {
    // The source list is optional navigation context; page-level boundaries own data failures.
    sources = [];
  }

  return <AppShell sources={sources}>{children}</AppShell>;
}
