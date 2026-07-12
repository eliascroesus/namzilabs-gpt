import { and, eq } from "drizzle-orm";

import { getConnector } from "@/connectors/registry";
import type { Database } from "@/db/client";
import {
  connections,
  sourceRecords,
  syncCursors,
  syncRuns,
  webhookSubscriptions,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { asProviderId, connectorContext } from "@/server/connections/service";

export function shouldRenewSubscription(
  expiresAt: Date | string | null,
  now = new Date(),
): boolean {
  const expiration = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Boolean(expiration && expiration.getTime() <= now.getTime() + 24 * 60 * 60 * 1_000);
}

export async function reconcilePage(
  db: Database,
  input: { connectionId: string; cursor?: string; callbackUrl: string },
): Promise<{ nextCursor: string | null; recordsWritten: number }> {
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, input.connectionId))
    .limit(1);
  if (!connection || connection.status === "revoked") {
    throw new AppError("connection_not_found", "Connection not found.", 404);
  }
  const connector = getConnector(asProviderId(connection.provider));
  const context = await connectorContext(db, connection, input.callbackUrl);
  const [run] = await db
    .insert(syncRuns)
    .values({
      organizationId: connection.organizationId,
      connectionId: connection.id,
      kind: input.cursor ? "incremental" : "reconciliation",
      status: "running",
      cursorStart: input.cursor,
      startedAt: new Date(),
    })
    .returning({ id: syncRuns.id });
  const page = input.cursor
    ? await connector.continueBackfill(context, input.cursor)
    : await connector.startBackfill(context);
  let written = 0;
  await db.transaction(async (tx) => {
    for (const record of page.records) {
      const normalized = await connector.normalizeRecord(context, record);
      const incomingUpdatedAt = normalized.sourceUpdatedAt
        ? new Date(normalized.sourceUpdatedAt)
        : undefined;
      await tx
        .insert(sourceRecords)
        .values({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          resourceType: normalized.resourceType,
          externalId: normalized.externalId,
          sourceVersion: normalized.sourceVersion,
          sourceUpdatedAt: incomingUpdatedAt,
          occurredAt: normalized.occurredAt ? new Date(normalized.occurredAt) : undefined,
          isDeleted: normalized.isDeleted,
          data: normalized.data,
          mappingVersion: connector.manifest.mappingVersion,
        })
        .onConflictDoUpdate({
          target: [
            sourceRecords.organizationId,
            sourceRecords.connectionId,
            sourceRecords.resourceType,
            sourceRecords.externalId,
          ],
          set: {
            sourceVersion: normalized.sourceVersion,
            sourceUpdatedAt: incomingUpdatedAt,
            occurredAt: normalized.occurredAt ? new Date(normalized.occurredAt) : undefined,
            isDeleted: normalized.isDeleted,
            data: normalized.data,
            mappingVersion: connector.manifest.mappingVersion,
            updatedAt: new Date(),
          },
        });
      written += 1;
    }
    await tx
      .insert(syncCursors)
      .values({
        organizationId: connection.organizationId,
        connectionId: connection.id,
        resourceType: "default",
        cursor: page.nextCursor,
        highWatermark: page.highWatermark ? new Date(page.highWatermark) : new Date(),
      })
      .onConflictDoUpdate({
        target: [syncCursors.organizationId, syncCursors.connectionId, syncCursors.resourceType],
        set: {
          cursor: page.nextCursor,
          highWatermark: page.highWatermark ? new Date(page.highWatermark) : new Date(),
          updatedAt: new Date(),
        },
      });
    if (run) {
      await tx
        .update(syncRuns)
        .set({
          status: "succeeded",
          cursorEnd: page.nextCursor,
          recordsSeen: page.records.length,
          recordsWritten: written,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncRuns.id, run.id));
    }
    await tx
      .update(connections)
      .set({
        lastReconciledAt: new Date(),
        freshness: page.nextCursor ? "syncing" : "current",
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, connection.id));
  });
  return { nextCursor: page.nextCursor, recordsWritten: written };
}

export async function renewExpiringSubscription(
  db: Database,
  subscriptionId: string,
  callbackUrl: string,
): Promise<void> {
  const [subscription] = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, subscriptionId))
    .limit(1);
  if (!subscription || !subscription.active || !shouldRenewSubscription(subscription.expiresAt))
    return;
  const [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.organizationId, subscription.organizationId),
        eq(connections.id, subscription.connectionId),
      ),
    )
    .limit(1);
  if (!connection) return;
  const connector = getConnector(asProviderId(connection.provider));
  const context = await connectorContext(db, connection, callbackUrl);
  const renewed = await connector.renewSubscription(context, {
    externalId: subscription.externalId ?? undefined,
    resourceId: subscription.resourceId ?? undefined,
    expiresAt: subscription.expiresAt?.toISOString(),
    metadata: subscription.metadata,
  });
  await db
    .update(webhookSubscriptions)
    .set({
      externalId: renewed.externalId,
      resourceId: renewed.resourceId,
      expiresAt: renewed.expiresAt ? new Date(renewed.expiresAt) : undefined,
      metadata: renewed.metadata ?? {},
      updatedAt: new Date(),
    })
    .where(eq(webhookSubscriptions.id, subscription.id));
}
