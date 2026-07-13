import { listGoogleSheetTabs } from "@/connectors/providers/google-sheets";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { connectorContext, getConnectionForOrganization } from "@/server/connections/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; resourceId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const { connectionId, resourceId } = await params;
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    if (connection.provider !== "google-sheets") {
      throw new AppError("resource_children_not_supported", "This source has no child tabs.", 400);
    }
    const context = await connectorContext(
      db,
      connection,
      `${env().APP_URL}/api/webhooks/${connection.id}`,
    );
    const data = await listGoogleSheetTabs(context, resourceId);
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
