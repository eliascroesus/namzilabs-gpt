import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { auditLogs, connections, outboxEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import {
  asProviderId,
  connectionDetails,
  connectorContext,
  getConnectionForOrganization,
} from "@/server/connections/service";
import { deleteCredentials } from "@/server/credentials/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const { connectionId } = await params;
    const data = await connectionDetails(getDb(), tenant.organizationId, connectionId);
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

const updateSchema = z.object({
  configuration: z.record(z.string(), z.unknown()),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const { connectionId } = await params;
    const input = updateSchema.parse(await request.json());
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    if (connection.provider === "google-sheets") {
      z.object({
        spreadsheetId: z.string().trim().min(10).max(200),
        range: z.string().trim().min(1).max(200),
        uniqueKeyColumn: z.string().trim().min(1).max(100),
        syncMode: z.enum(["upsert", "append-only"]),
      }).parse(input.configuration);
    }
    await db.transaction(async (tx) => {
      await tx
        .update(connections)
        .set({ configuration: input.configuration, updatedAt: new Date() })
        .where(
          and(
            eq(connections.organizationId, tenant.organizationId),
            eq(connections.id, connection.id),
          ),
        );
      await tx.insert(outboxEvents).values({
        organizationId: tenant.organizationId,
        aggregateType: "connection",
        aggregateId: connection.id,
        eventName: "namzi/connection.reconcile",
        payload: { connectionId: connection.id },
      });
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "connection.configuration_updated",
        resourceType: "connection",
        resourceId: connection.id,
        requestId,
        safeMetadata: { provider: connection.provider },
      });
    });
    return Response.json(
      { data: { id: connection.id, configuration: input.configuration }, requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("admin");
    const { connectionId } = await params;
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    const context = await connectorContext(
      db,
      connection,
      `${env().APP_URL}/api/webhooks/${connection.id}`,
    );
    await getConnector(asProviderId(connection.provider)).revokeCredentials(context);
    await deleteCredentials(db, tenant.organizationId, connection.id);
    const deleteData = new URL(request.url).searchParams.get("deleteData") === "true";
    if (deleteData) {
      await db
        .delete(connections)
        .where(
          and(
            eq(connections.organizationId, tenant.organizationId),
            eq(connections.id, connection.id),
          ),
        );
    } else {
      await db
        .update(connections)
        .set({ status: "revoked", freshness: "unavailable", updatedAt: new Date() })
        .where(
          and(
            eq(connections.organizationId, tenant.organizationId),
            eq(connections.id, connection.id),
          ),
        );
    }
    await db.insert(auditLogs).values({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      action: deleteData ? "connection.deleted" : "connection.disconnected",
      resourceType: "connection",
      resourceId: connection.id,
      requestId,
    });
    return new Response(null, { status: 204, headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
