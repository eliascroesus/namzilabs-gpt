import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { connectionResources, connections } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getConnectionForOrganization } from "@/server/connections/service";
import { reconcilePage } from "@/server/reconciliation/service";

export type ReconciliationResult = {
  connectionId: string;
  status: "current" | "partial" | "no_resources";
  resources: number;
  pages: number;
  recordsWritten: number;
  recordsDeleted: number;
};

export async function reconcileConnectionFully(
  db: Database,
  input: {
    organizationId: string;
    connectionId: string;
    callbackUrl: string;
    resourceId?: string;
    maxPages?: number;
  },
): Promise<ReconciliationResult> {
  const connection = await getConnectionForOrganization(
    db,
    input.organizationId,
    input.connectionId,
  );
  if (connection.status !== "active") {
    throw new AppError(
      "connection_not_active",
      "Reconnect this source before refreshing its data.",
      409,
    );
  }

  const resourceIds = input.resourceId
    ? [input.resourceId]
    : connection.provider === "google-sheets"
      ? (
          await db
            .select({ id: connectionResources.id })
            .from(connectionResources)
            .where(
              and(
                eq(connectionResources.organizationId, input.organizationId),
                eq(connectionResources.connectionId, connection.id),
                eq(connectionResources.active, true),
              ),
            )
        ).map((resource) => resource.id)
      : [undefined];

  if (resourceIds.length === 0) {
    return {
      connectionId: connection.id,
      status: "no_resources",
      resources: 0,
      pages: 0,
      recordsWritten: 0,
      recordsDeleted: 0,
    };
  }

  const pageLimit = Math.min(100, Math.max(1, input.maxPages ?? 20));
  let pages = 0;
  let recordsWritten = 0;
  let recordsDeleted = 0;
  let partial = false;

  for (const resourceId of resourceIds) {
    let cursor: string | undefined;
    let runId: string | undefined;
    let resourcePages = 0;
    do {
      const page = await reconcilePage(db, {
        connectionId: connection.id,
        ...(resourceId ? { resourceId } : {}),
        cursor,
        runId,
        callbackUrl: input.callbackUrl,
      });
      cursor = page.nextCursor ?? undefined;
      runId = page.runId;
      recordsWritten += page.recordsWritten;
      recordsDeleted += page.recordsDeleted;
      pages += 1;
      resourcePages += 1;
    } while (cursor && resourcePages < pageLimit);
    partial ||= Boolean(cursor);
  }

  return {
    connectionId: connection.id,
    status: partial ? "partial" : "current",
    resources: resourceIds.length,
    pages,
    recordsWritten,
    recordsDeleted,
  };
}

export async function reconcileAllConnections(
  db: Database,
  input: {
    organizationId: string;
    callbackUrlFor: (connectionId: string) => string;
    maxPagesPerResource?: number;
  },
): Promise<{
  successful: ReconciliationResult[];
  failed: { connectionId: string; message: string }[];
}> {
  const active = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(eq(connections.organizationId, input.organizationId), eq(connections.status, "active")),
    );
  const successful: ReconciliationResult[] = [];
  const failed: { connectionId: string; message: string }[] = [];
  for (const connection of active) {
    try {
      successful.push(
        await reconcileConnectionFully(db, {
          organizationId: input.organizationId,
          connectionId: connection.id,
          callbackUrl: input.callbackUrlFor(connection.id),
          maxPages: input.maxPagesPerResource,
        }),
      );
    } catch (error) {
      failed.push({
        connectionId: connection.id,
        message: error instanceof Error ? error.message : "Data refresh failed.",
      });
    }
  }
  return { successful, failed };
}
