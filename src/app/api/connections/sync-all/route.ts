import { auditLogs } from "@/db/schema";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { reconcileAllConnections } from "@/server/reconciliation/run";

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const db = getDb();
    const data = await reconcileAllConnections(db, {
      organizationId: tenant.organizationId,
      callbackUrlFor: (connectionId) => `${env().APP_URL}/api/webhooks/${connectionId}`,
      maxPagesPerResource: 20,
    });
    const recordsWritten = data.successful.reduce(
      (total, result) => total + result.recordsWritten,
      0,
    );
    await db.insert(auditLogs).values({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      action: "connections.refresh_all",
      resourceType: "organization",
      resourceId: tenant.organizationId,
      requestId,
      safeMetadata: {
        successful: data.successful.length,
        failed: data.failed.length,
        recordsWritten,
      },
    });
    return Response.json(
      {
        data: {
          ...data,
          recordsWritten,
          connectionsRefreshed: data.successful.length,
        },
        requestId,
      },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
