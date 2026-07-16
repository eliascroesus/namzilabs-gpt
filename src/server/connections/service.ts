import { and, desc, eq } from "drizzle-orm";

import { connectionResources, connections, rawEvents, syncCursors } from "@/db/schema";
import type { Database } from "@/db/client";
import type { ConnectorContext, ProviderId } from "@/connectors/types";
import { loadCredentials } from "@/server/credentials/service";
import { AppError } from "@/lib/errors";
import { ensureFreshAccessToken } from "@/server/oauth/refresh";

export async function getConnectionForOrganization(
  db: Database,
  organizationId: string,
  connectionId: string,
) {
  const [connection] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.organizationId, organizationId), eq(connections.id, connectionId)))
    .limit(1);
  if (!connection) throw new AppError("connection_not_found", "Connection not found.", 404);
  return connection;
}

export async function getPublicConnection(db: Database, connectionId: string) {
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);
  if (!connection || connection.status === "revoked") {
    throw new AppError("connection_not_found", "Connection not found.", 404);
  }
  return connection;
}

export async function connectorContext(
  db: Database,
  connection: typeof connections.$inferSelect,
  callbackUrl: string,
  options: { refreshAccessToken?: boolean } = {},
): Promise<ConnectorContext> {
  if (options.refreshAccessToken !== false) await ensureFreshAccessToken(db, connection);
  return {
    organizationId: connection.organizationId,
    connectionId: connection.id,
    callbackUrl,
    credentials: await loadCredentials(db, connection.organizationId, connection.id),
    configuration: connection.configuration,
  };
}

export async function connectionDetails(
  db: Database,
  organizationId: string,
  connectionId: string,
) {
  const connection = await getConnectionForOrganization(db, organizationId, connectionId);
  const [cursorRows, eventRows, resourceRows] = await Promise.all([
    db
      .select()
      .from(syncCursors)
      .where(
        and(
          eq(syncCursors.organizationId, organizationId),
          eq(syncCursors.connectionId, connectionId),
        ),
      ),
    db
      .select({
        id: rawEvents.id,
        eventType: rawEvents.eventType,
        receivedAt: rawEvents.receivedAt,
        status: rawEvents.status,
      })
      .from(rawEvents)
      .where(
        and(eq(rawEvents.organizationId, organizationId), eq(rawEvents.connectionId, connectionId)),
      )
      .orderBy(desc(rawEvents.receivedAt))
      .limit(5),
    db
      .select()
      .from(connectionResources)
      .where(
        and(
          eq(connectionResources.organizationId, organizationId),
          eq(connectionResources.connectionId, connectionId),
          eq(connectionResources.active, true),
        ),
      )
      .orderBy(desc(connectionResources.updatedAt)),
  ]);
  return { connection, cursors: cursorRows, recentEvents: eventRows, resources: resourceRows };
}

export function asProviderId(provider: string): ProviderId {
  const allowed: ProviderId[] = [
    "webhook",
    "google-sheets",
    "calendly",
    "close",
    "instantly",
    "brevo",
    "cal-com",
    "google-calendar",
    "stripe",
    "whop",
    "propal",
  ];
  if (!allowed.includes(provider as ProviderId))
    throw new AppError("connector_not_found", "Connector not found.", 404);
  return provider as ProviderId;
}
