import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { auditLogs, connections, outboxEvents } from "@/db/schema";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { getConnectionForOrganization } from "@/server/connections/service";
import { env } from "@/lib/env";
import { reconcileConnectionFully } from "@/server/reconciliation/run";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const { connectionId } = await params;
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    await db.transaction(async (tx) => {
      await tx
        .update(connections)
        .set({ freshness: "syncing", updatedAt: new Date() })
        .where(
          and(
            eq(connections.organizationId, tenant.organizationId),
            eq(connections.id, connection.id),
          ),
        );
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "connection.reconciliation_requested",
        resourceType: "connection",
        resourceId: connection.id,
        requestId,
        safeMetadata: { provider: connection.provider },
      });
    });
    try {
      const data = await reconcileConnectionFully(db, {
        organizationId: tenant.organizationId,
        connectionId: connection.id,
        callbackUrl: `${env().APP_URL}/api/webhooks/${connection.id}`,
        maxPages: 20,
      });
      return Response.json(
        { data, requestId },
        { headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    } catch (error) {
      await db.insert(outboxEvents).values({
        organizationId: tenant.organizationId,
        aggregateType: "connection",
        aggregateId: connection.id,
        eventName: "namzi/connection.reconcile",
        payload: { connectionId: connection.id },
        lastError: error instanceof Error ? error.message.slice(0, 300) : "Direct refresh failed",
      });
    }
    return Response.json(
      { data: { connectionId: connection.id, status: "queued" }, requestId },
      { status: 202, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
