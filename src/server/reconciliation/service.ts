import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { getConnector } from "@/connectors/registry";
import type { BackfillPage } from "@/connectors/types";
import type { Database } from "@/db/client";
import {
  activityFacts,
  connectionResources,
  connections,
  sourceRecords,
  syncCursors,
  syncRuns,
  webhookSubscriptions,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { asProviderId, connectorContext } from "@/server/connections/service";
import { storeCredential } from "@/server/credentials/service";
import { recordMeasurementSafely } from "@/server/operations/service";

export function shouldRenewSubscription(
  expiresAt: Date | string | null,
  now = new Date(),
): boolean {
  const expiration = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Boolean(expiration && expiration.getTime() <= now.getTime() + 24 * 60 * 60 * 1_000);
}

export async function reconcilePage(
  db: Database,
  input: {
    connectionId: string;
    resourceId?: string;
    cursor?: string;
    runId?: string;
    callbackUrl: string;
  },
): Promise<{
  nextCursor: string | null;
  recordsWritten: number;
  recordsDeleted: number;
  runId: string;
}> {
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, input.connectionId))
    .limit(1);
  if (!connection || connection.status === "revoked") {
    throw new AppError("connection_not_found", "Connection not found.", 404);
  }
  const [resource] = input.resourceId
    ? await db
        .select()
        .from(connectionResources)
        .where(
          and(
            eq(connectionResources.id, input.resourceId),
            eq(connectionResources.organizationId, connection.organizationId),
            eq(connectionResources.connectionId, connection.id),
            eq(connectionResources.active, true),
          ),
        )
        .limit(1)
    : [];
  if (input.resourceId && !resource) {
    throw new AppError("connection_resource_not_found", "Tracked source not found.", 404);
  }
  const cursorResourceType = resource ? `resource:${resource.id}` : "default";
  const [storedCursor] =
    !input.cursor && connection.provider === "google-calendar"
      ? await db
          .select({ cursor: syncCursors.cursor })
          .from(syncCursors)
          .where(
            and(
              eq(syncCursors.organizationId, connection.organizationId),
              eq(syncCursors.connectionId, connection.id),
              eq(syncCursors.resourceType, cursorResourceType),
            ),
          )
          .limit(1)
      : [];
  const effectiveCursor = input.cursor ?? storedCursor?.cursor ?? undefined;
  const [existingRun] = input.runId
    ? await db
        .select()
        .from(syncRuns)
        .where(
          and(
            eq(syncRuns.id, input.runId),
            eq(syncRuns.connectionId, connection.id),
            eq(syncRuns.organizationId, connection.organizationId),
          ),
        )
        .limit(1)
    : [];
  const [createdRun] = existingRun
    ? []
    : await db
        .insert(syncRuns)
        .values({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          kind: effectiveCursor ? "incremental" : "reconciliation",
          status: "running",
          cursorStart: effectiveCursor,
          startedAt: new Date(),
        })
        .returning();
  const run = existingRun ?? createdRun;
  if (!run || !["running", "failed"].includes(run.status) || !run.startedAt) {
    throw new AppError("sync_run_not_found", "The reconciliation run is not available.", 409);
  }
  const runStartedAt = run.startedAt;
  if (run.status === "failed") {
    await db
      .update(syncRuns)
      .set({
        status: "running",
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(syncRuns.id, run.id));
  }

  const connector = getConnector(asProviderId(connection.provider));
  try {
    const baseContext = await connectorContext(db, connection, input.callbackUrl);
    const context = resource
      ? {
          ...baseContext,
          configuration: { ...baseContext.configuration, ...resource.configuration },
        }
      : baseContext;
    let page: BackfillPage;
    try {
      page = effectiveCursor
        ? await connector.continueBackfill(context, effectiveCursor)
        : await connector.startBackfill(context);
    } catch (error) {
      const expiredGoogleCursor =
        connection.provider === "google-calendar" &&
        effectiveCursor?.startsWith("sync:") &&
        error instanceof AppError &&
        error.details?.providerStatus === 410;
      if (!expiredGoogleCursor) throw error;
      await db
        .delete(syncCursors)
        .where(
          and(
            eq(syncCursors.organizationId, connection.organizationId),
            eq(syncCursors.connectionId, connection.id),
            eq(syncCursors.resourceType, cursorResourceType),
          ),
        );
      page = await connector.startBackfill(context);
    }
    let written = 0;
    let deleted = 0;
    await db.transaction(async (tx) => {
      for (const record of page.records) {
        const normalized = await connector.normalizeRecord(context, record);
        const incomingUpdatedAt = normalized.sourceUpdatedAt
          ? new Date(normalized.sourceUpdatedAt)
          : undefined;
        const [sourceRecord] = await tx
          .insert(sourceRecords)
          .values({
            organizationId: connection.organizationId,
            connectionId: connection.id,
            resourceType: normalized.resourceType,
            externalId: normalized.externalId,
            sourceVersion: normalized.sourceVersion,
            sourceUpdatedAt: incomingUpdatedAt,
            occurredAt: normalized.occurredAt ? new Date(normalized.occurredAt) : undefined,
            displayName: normalized.promoted?.displayName,
            normalizedEmail: normalized.promoted?.normalizedEmail,
            normalizedPhone: normalized.promoted?.normalizedPhone,
            status: normalized.promoted?.status,
            ownerExternalId: normalized.promoted?.ownerExternalId,
            campaignExternalId: normalized.promoted?.campaignExternalId,
            amount: normalized.promoted?.amount,
            currency: normalized.promoted?.currency,
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
              displayName: normalized.promoted?.displayName,
              normalizedEmail: normalized.promoted?.normalizedEmail,
              normalizedPhone: normalized.promoted?.normalizedPhone,
              status: normalized.promoted?.status,
              ownerExternalId: normalized.promoted?.ownerExternalId,
              campaignExternalId: normalized.promoted?.campaignExternalId,
              amount: normalized.promoted?.amount,
              currency: normalized.promoted?.currency,
              isDeleted: normalized.isDeleted,
              data: normalized.data,
              mappingVersion: connector.manifest.mappingVersion,
              updatedAt: new Date(),
            },
          })
          .returning({ id: sourceRecords.id });
        if (normalized.activity && sourceRecord) {
          await tx
            .insert(activityFacts)
            .values({
              organizationId: connection.organizationId,
              connectionId: connection.id,
              sourceRecordId: sourceRecord.id,
              activityType: normalized.activity.type,
              externalId: normalized.activity.externalId,
              occurredAt: new Date(normalized.activity.occurredAt),
              status: normalized.activity.promoted?.status,
              channel: normalized.activity.promoted?.channel,
              ownerId: normalized.activity.promoted?.ownerId,
              amount: normalized.activity.promoted?.amount,
              durationSeconds: normalized.activity.promoted?.durationSeconds,
              dimensions: normalized.activity.dimensions,
              measures: normalized.activity.measures ?? {},
              isDeleted: normalized.isDeleted,
            })
            .onConflictDoUpdate({
              target: [
                activityFacts.organizationId,
                activityFacts.connectionId,
                activityFacts.activityType,
                activityFacts.externalId,
              ],
              set: {
                occurredAt: new Date(normalized.activity.occurredAt),
                status: normalized.activity.promoted?.status,
                channel: normalized.activity.promoted?.channel,
                ownerId: normalized.activity.promoted?.ownerId,
                amount: normalized.activity.promoted?.amount,
                durationSeconds: normalized.activity.promoted?.durationSeconds,
                dimensions: normalized.activity.dimensions,
                measures: normalized.activity.measures ?? {},
                isDeleted: normalized.isDeleted,
                updatedAt: new Date(),
              },
            });
        }
        written += 1;
      }

      if (
        !page.nextCursor &&
        connection.provider === "google-sheets" &&
        context.configuration.syncMode !== "append-only"
      ) {
        const tombstones = await tx
          .update(sourceRecords)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(
            and(
              eq(sourceRecords.organizationId, connection.organizationId),
              eq(sourceRecords.connectionId, connection.id),
              eq(sourceRecords.resourceType, String(context.configuration.resourceType ?? "row")),
              eq(sourceRecords.isDeleted, false),
              lt(sourceRecords.updatedAt, runStartedAt),
            ),
          )
          .returning({ id: sourceRecords.id });
        deleted = tombstones.length;
        if (tombstones.length > 0) {
          await tx
            .update(activityFacts)
            .set({ isDeleted: true, updatedAt: new Date() })
            .where(
              inArray(
                activityFacts.sourceRecordId,
                tombstones.map((row) => row.id),
              ),
            );
        }
      }
      await tx
        .insert(syncCursors)
        .values({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          resourceType: cursorResourceType,
          cursor: page.nextCursor ?? page.checkpoint,
          highWatermark: page.highWatermark ? new Date(page.highWatermark) : new Date(),
        })
        .onConflictDoUpdate({
          target: [syncCursors.organizationId, syncCursors.connectionId, syncCursors.resourceType],
          set: {
            cursor: page.nextCursor ?? page.checkpoint,
            highWatermark: page.highWatermark ? new Date(page.highWatermark) : new Date(),
            updatedAt: new Date(),
          },
        });
      await tx
        .update(syncRuns)
        .set({
          status: page.nextCursor ? "running" : "succeeded",
          cursorEnd: page.nextCursor,
          recordsSeen: sql`${syncRuns.recordsSeen} + ${page.records.length}`,
          recordsWritten: sql`${syncRuns.recordsWritten} + ${written}`,
          recordsDeleted: sql`${syncRuns.recordsDeleted} + ${deleted}`,
          completedAt: page.nextCursor ? undefined : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncRuns.id, run.id));
      await tx
        .update(connections)
        .set({
          status: "active",
          lastReconciledAt: page.nextCursor ? connection.lastReconciledAt : new Date(),
          lastSuccessfulSyncAt: page.nextCursor ? connection.lastSuccessfulSyncAt : new Date(),
          consecutiveFailures: 0,
          freshness: page.nextCursor ? "syncing" : "current",
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, connection.id));
    });
    await recordMeasurementSafely(db, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      name: "reconciliation_repair_count",
      value: deleted,
      unit: "count",
      safeDimensions: { provider: connection.provider },
    });
    await recordMeasurementSafely(db, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      name: "provider_api_request",
      value: 1,
      unit: "count",
      outcome: "success",
      safeDimensions: { provider: connection.provider, operation: "reconcile_page" },
    });
    return {
      nextCursor: page.nextCursor,
      recordsWritten: written,
      recordsDeleted: deleted,
      runId: run.id,
    };
  } catch (error) {
    const authorizationFailure = error instanceof AppError && error.status === 401;
    const failures = connection.consecutiveFailures + 1;
    await db.transaction(async (tx) => {
      await tx
        .update(syncRuns)
        .set({
          status: "failed",
          errorCode: authorizationFailure ? "authorization_failed" : "reconciliation_failed",
          errorMessage: authorizationFailure
            ? "Provider authorization failed. Reconnect the account."
            : "Reconciliation failed and will be retried.",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncRuns.id, run.id));
      await tx
        .update(connections)
        .set({
          status: failures >= 3 ? (authorizationFailure ? "paused" : "error") : connection.status,
          freshness: authorizationFailure && failures >= 3 ? "unavailable" : "delayed",
          consecutiveFailures: failures,
          lastErrorCode: authorizationFailure ? "authorization_failed" : "reconciliation_failed",
          lastErrorMessage: authorizationFailure
            ? "Reconnect this provider to resume syncing."
            : "The latest reconciliation attempt failed.",
          updatedAt: new Date(),
        })
        .where(eq(connections.id, connection.id));
    });
    await recordMeasurementSafely(db, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      name: "provider_api_request",
      value: 1,
      unit: "count",
      outcome: "failure",
      safeDimensions: { provider: connection.provider, operation: "reconcile_page" },
    });
    if (authorizationFailure) {
      await recordMeasurementSafely(db, {
        organizationId: connection.organizationId,
        connectionId: connection.id,
        name: "oauth_refresh_failure",
        value: 1,
        unit: "count",
        outcome: "failure",
        safeDimensions: { provider: connection.provider },
      });
    }
    throw error;
  }
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
  for (const [type, value] of Object.entries(renewed.credentialUpdates ?? {})) {
    await storeCredential(db, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      type,
      value,
    });
  }
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
