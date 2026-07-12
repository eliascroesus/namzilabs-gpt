import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import {
  asProviderId,
  connectorContext,
  getConnectionForOrganization,
} from "@/server/connections/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const { connectionId } = await params;
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    const context = await connectorContext(
      db,
      connection,
      `${env().APP_URL}/api/webhooks/${connection.id}`,
    );
    const data = await getConnector(asProviderId(connection.provider)).fetchSample(context, 3);
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
