import { MetricBuilder } from "@/components/metric-builder";
import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { env } from "@/lib/env";
import { requireTenantContext } from "@/server/auth/tenant";
import { eq } from "drizzle-orm";

export const metadata = { title: "Build metric" };
export const dynamic = "force-dynamic";

export default async function NewMetricPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string }>;
}) {
  const tenant = await requireTenantContext();
  let rows: {
    id: string;
    provider: string;
    name: string;
    accountName: string | null;
    status: string;
    freshness: string;
  }[] = [];
  try {
    rows = await getDb()
      .select({
        id: connections.id,
        provider: connections.provider,
        name: connections.name,
        accountName: connections.externalAccountName,
        status: connections.status,
        freshness: connections.freshness,
      })
      .from(connections)
      .where(eq(connections.organizationId, tenant.organizationId));
  } catch (error) {
    if (env().APP_ENV !== "test") throw error;
  }
  const available = rows
    .filter((connection) => connection.status === "active")
    .map((connection) => {
      const manifest = getConnector(
        connection.provider as Parameters<typeof getConnector>[0],
      ).manifest;
      return {
        ...connection,
        providerName: manifest.name,
        logo: manifest.logo,
        resources: [...manifest.resources],
      };
    });
  return (
    <MetricBuilder connections={available} initialConnectionId={(await searchParams).connection} />
  );
}
