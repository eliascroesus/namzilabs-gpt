import { MetricBuilder, type MetricComponent } from "@/components/metric-builder";
import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { connections, metrics, metricVersions } from "@/db/schema";
import { env } from "@/lib/env";
import { requireTenantContext } from "@/server/auth/tenant";
import { and, eq } from "drizzle-orm";
import { parseMetricDefinition } from "@/server/metrics/dsl";

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
  let metricComponents: MetricComponent[] = [];
  try {
    const db = getDb();
    const [connectionRows, componentRows] = await Promise.all([
      db
        .select({
          id: connections.id,
          provider: connections.provider,
          name: connections.name,
          accountName: connections.externalAccountName,
          status: connections.status,
          freshness: connections.freshness,
        })
        .from(connections)
        .where(eq(connections.organizationId, tenant.organizationId)),
      db
        .select({
          metricId: metrics.id,
          versionId: metricVersions.id,
          name: metrics.name,
          description: metrics.description,
          definition: metricVersions.definition,
        })
        .from(metrics)
        .innerJoin(
          metricVersions,
          and(
            eq(metricVersions.metricId, metrics.id),
            eq(metricVersions.version, metrics.currentPublishedVersion),
            eq(metricVersions.status, "published"),
          ),
        )
        .where(eq(metrics.organizationId, tenant.organizationId)),
    ]);
    rows = connectionRows;
    metricComponents = componentRows.map((component) => {
      const definition = parseMetricDefinition(component.definition);
      const sourceLabel = definition.source
        ? [definition.source.spreadsheetName, definition.source.sheetName]
            .filter(Boolean)
            .join(" / ") || definition.source.provider
        : "Combined metrics";
      return { ...component, sourceLabel };
    });
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
    <MetricBuilder
      connections={available}
      metricComponents={metricComponents}
      initialConnectionId={(await searchParams).connection}
    />
  );
}
