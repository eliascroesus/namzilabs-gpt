import { and, desc, eq } from "drizzle-orm";

import { flattenDataRecord } from "@/connectors/shared";
import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { rawEvents } from "@/db/schema";
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
    const connector = getConnector(asProviderId(connection.provider));
    const recent = await db
      .select({ payload: rawEvents.payload })
      .from(rawEvents)
      .where(
        and(
          eq(rawEvents.organizationId, tenant.organizationId),
          eq(rawEvents.connectionId, connection.id),
        ),
      )
      .orderBy(desc(rawEvents.receivedAt))
      .limit(3);
    let samples = connection.provider === "webhook" ? recent.map((row) => row.payload) : [];
    if (samples.length === 0) {
      try {
        samples = await connector.fetchSample(context, 3);
      } catch (error) {
        if (recent.length === 0) throw error;
        samples = recent.map((row) => row.payload);
      }
    }
    if (samples.length === 0) samples = recent.map((row) => row.payload);
    const data = samples.map((sample) => flattenDataRecord(sample));
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
