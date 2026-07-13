import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { columnName, listGoogleSpreadsheets } from "@/connectors/providers/google-sheets";
import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { connectionResources, connections, outboxEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
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
    if (connection.status !== "active") {
      throw new AppError(
        "connection_not_active",
        "Reconnect this account before browsing data.",
        409,
      );
    }
    const context = await connectorContext(
      db,
      connection,
      `${env().APP_URL}/api/webhooks/${connection.id}`,
    );
    const url = new URL(request.url);
    if (connection.provider === "google-sheets") {
      const result = await listGoogleSpreadsheets(context, {
        query: url.searchParams.get("query") ?? undefined,
        pageToken: url.searchParams.get("pageToken") ?? undefined,
      });
      return Response.json(
        { data: result.resources, nextPageToken: result.nextPageToken, requestId },
        { headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    }
    const data = await getConnector(asProviderId(connection.provider)).discoverResources(context);
    return Response.json(
      { data, nextPageToken: null, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

const trackSchema = z.object({
  spreadsheetId: z.string().min(10).max(200),
  spreadsheetName: z.string().trim().min(1).max(200),
  sheetId: z.number().int().nonnegative(),
  sheetName: z.string().trim().min(1).max(200),
  columnCount: z.number().int().positive().max(18_278),
  uniqueKeyColumn: z.string().trim().min(1).max(200).optional(),
  timestampColumn: z.string().trim().min(1).max(200).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const { connectionId } = await params;
    const input = trackSchema.parse(await request.json());
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    if (connection.provider !== "google-sheets") {
      throw new AppError(
        "resource_tracking_not_supported",
        "This source does not use spreadsheet tracking.",
        400,
      );
    }
    const externalId = `${input.spreadsheetId}:${input.sheetId}`;
    const resourceType = `google-sheet:${externalId}`;
    const configuration = {
      spreadsheetId: input.spreadsheetId,
      spreadsheetName: input.spreadsheetName,
      sheetId: input.sheetId,
      sheetName: input.sheetName,
      range: `'${input.sheetName.replaceAll("'", "''")}'!A:${columnName(input.columnCount)}`,
      columnCount: input.columnCount,
      uniqueKeyColumn: input.uniqueKeyColumn ?? "__namzi_row_number",
      timestampColumn: input.timestampColumn,
      syncMode: "upsert",
      pageSize: 500,
      resourceType,
    };
    const data = await db.transaction(async (tx) => {
      const [resource] = await tx
        .insert(connectionResources)
        .values({
          organizationId: tenant.organizationId,
          connectionId: connection.id,
          resourceType: "sheet",
          externalId,
          name: `${input.spreadsheetName} / ${input.sheetName}`,
          configuration,
          active: true,
        })
        .onConflictDoUpdate({
          target: [
            connectionResources.organizationId,
            connectionResources.connectionId,
            connectionResources.resourceType,
            connectionResources.externalId,
          ],
          set: {
            name: `${input.spreadsheetName} / ${input.sheetName}`,
            configuration,
            active: true,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!resource) throw new Error("Resource tracking failed");
      await tx.insert(outboxEvents).values({
        organizationId: tenant.organizationId,
        aggregateType: "connection_resource",
        aggregateId: resource.id,
        eventName: "namzi/connection.reconcile",
        payload: { connectionId: connection.id, resourceId: resource.id },
      });
      await tx
        .update(connections)
        .set({ freshness: "syncing", updatedAt: new Date() })
        .where(
          and(
            eq(connections.organizationId, tenant.organizationId),
            eq(connections.id, connection.id),
          ),
        );
      return resource;
    });
    return Response.json(
      { data: { id: data.id, resourceType, status: "syncing" }, requestId },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
