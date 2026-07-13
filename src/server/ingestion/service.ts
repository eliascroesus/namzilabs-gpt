import { and, count, eq, gt, sql } from "drizzle-orm";

import { getConnector } from "@/connectors/registry";
import type { IncomingWebhook, ParsedWebhookEvent } from "@/connectors/types";
import type { Database } from "@/db/client";
import {
  activityFacts,
  connections,
  deadLetterEvents,
  outboxEvents,
  rawEvents,
  sourceRecords,
} from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { connectorContext, getPublicConnection } from "@/server/connections/service";
import { recordMeasurementSafely } from "@/server/operations/service";

const SAFE_HEADERS = new Set([
  "content-type",
  "user-agent",
  "x-goog-channel-id",
  "x-goog-message-number",
  "x-goog-resource-id",
  "x-goog-resource-state",
  "close-sig-timestamp",
  "x-namzi-timestamp",
]);

function safeHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].filter(([key]) => SAFE_HEADERS.has(key.toLowerCase())),
  );
}

export function deduplicationKey(event: ParsedWebhookEvent, rawBody: string): string {
  return event.providerEventId ? `provider:${event.providerEventId}` : `payload:${sha256(rawBody)}`;
}

export function isIncomingStale(
  existingUpdatedAt: Date | null,
  incomingUpdatedAt: Date | null,
): boolean {
  return Boolean(existingUpdatedAt && incomingUpdatedAt && existingUpdatedAt > incomingUpdatedAt);
}

export async function ingestWebhook(
  db: Database,
  input: { connectionId: string; request: IncomingWebhook; appUrl: string; startedAt?: number },
): Promise<{ accepted: number; duplicates: number; eventIds: string[] }> {
  const connection = await getPublicConnection(db, input.connectionId);
  const maxBodyBytes = Number(connection.configuration.maxBodyBytes ?? 1_048_576);
  if (Buffer.byteLength(input.request.rawBody, "utf8") > maxBodyBytes) {
    throw new AppError("payload_too_large", "Webhook payload is too large.", 413);
  }

  const rateRows = await db
    .select({ value: count() })
    .from(rawEvents)
    .where(
      and(
        eq(rawEvents.connectionId, connection.id),
        gt(rawEvents.receivedAt, new Date(Date.now() - 60_000)),
      ),
    );
  const eventsLastMinute = rateRows[0]?.value ?? 0;
  const perMinute = Number(connection.configuration.rateLimitPerMinute ?? 600);
  if (Number(eventsLastMinute) >= perMinute) {
    throw new AppError("rate_limited", "Webhook rate limit exceeded.", 429);
  }

  const context = await connectorContext(
    db,
    connection,
    `${input.appUrl}/api/webhooks/${connection.id}`,
  );
  const connector = getConnector(asProvider(connection.provider));
  if (!(await connector.verifyWebhook(context, input.request))) {
    throw new AppError("invalid_webhook_signature", "Webhook authentication failed.", 401);
  }
  const parsed = await connector.parseWebhook(context, input.request);
  if (parsed.length === 0)
    throw new AppError("empty_webhook", "The webhook contained no events.", 400);

  let duplicates = 0;
  const eventIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const event of parsed) {
      const key = deduplicationKey(event, input.request.rawBody);
      const inserted = await tx
        .insert(rawEvents)
        .values({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          provider: connection.provider,
          providerEventId: event.providerEventId,
          deduplicationKey: key,
          eventType: event.eventType,
          rawBody: input.request.rawBody,
          safeHeaders: safeHeaders(input.request.headers),
          payload: event.payload,
          payloadHash: sha256(input.request.rawBody),
          eventAt: event.eventAt ? new Date(event.eventAt) : undefined,
          sourceTimezone: event.sourceTimezone,
        })
        .onConflictDoNothing()
        .returning({ id: rawEvents.id });
      const eventId = inserted[0]?.id;
      if (!eventId) {
        duplicates += 1;
        continue;
      }
      eventIds.push(eventId);
      await tx.insert(outboxEvents).values({
        organizationId: connection.organizationId,
        aggregateType: "raw_event",
        aggregateId: eventId,
        eventName: "namzi/raw-event.received",
        payload: { rawEventId: eventId },
      });
    }
  });
  await recordMeasurementSafely(db, {
    organizationId: connection.organizationId,
    connectionId: connection.id,
    name: "webhook_acceptance_ms",
    value: Math.max(0, performance.now() - (input.startedAt ?? performance.now())),
    unit: "ms",
    safeDimensions: { provider: connection.provider, duplicate: eventIds.length === 0 },
  });
  return { accepted: eventIds.length, duplicates, eventIds };
}

function asProvider(provider: string) {
  return provider as Parameters<typeof getConnector>[0];
}

export async function processRawEvent(db: Database, rawEventId: string): Promise<void> {
  const [event] = await db.select().from(rawEvents).where(eq(rawEvents.id, rawEventId)).limit(1);
  if (!event || event.status === "processed" || event.status === "duplicate") return;
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, event.connectionId))
    .limit(1);
  if (!connection) throw new AppError("connection_not_found", "Connection not found.", 404);
  const context = await connectorContext(db, connection, "");
  const connector = getConnector(asProvider(connection.provider));
  if (connection.provider === "google-sheets" && event.eventType === "spreadsheet.changed") {
    await db.transaction(async (tx) => {
      await tx.insert(outboxEvents).values({
        organizationId: event.organizationId,
        aggregateType: "connection",
        aggregateId: connection.id,
        eventName: "namzi/connection.reconcile",
        payload: { connectionId: connection.id },
      });
      await tx
        .update(rawEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(rawEvents.id, event.id));
    });
    return;
  }
  const normalized = await connector.normalizeRecord(context, event.payload, event.eventType);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sourceRecords.id, sourceUpdatedAt: sourceRecords.sourceUpdatedAt })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.organizationId, event.organizationId),
          eq(sourceRecords.connectionId, event.connectionId),
          eq(sourceRecords.resourceType, normalized.resourceType),
          eq(sourceRecords.externalId, normalized.externalId),
        ),
      )
      .limit(1);
    const incomingUpdatedAt = normalized.sourceUpdatedAt
      ? new Date(normalized.sourceUpdatedAt)
      : null;
    const isStale = isIncomingStale(existing?.sourceUpdatedAt ?? null, incomingUpdatedAt);

    if (!isStale) {
      const [record] = await tx
        .insert(sourceRecords)
        .values({
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          resourceType: normalized.resourceType,
          externalId: normalized.externalId,
          sourceVersion: normalized.sourceVersion,
          sourceUpdatedAt: incomingUpdatedAt ?? undefined,
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
          rawEventId: event.id,
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
            sourceUpdatedAt: incomingUpdatedAt ?? undefined,
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
            rawEventId: event.id,
            updatedAt: new Date(),
          },
        })
        .returning({ id: sourceRecords.id });

      if (normalized.activity && record) {
        await tx
          .insert(activityFacts)
          .values({
            organizationId: event.organizationId,
            connectionId: event.connectionId,
            sourceRecordId: record.id,
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
    }
    await tx
      .update(rawEvents)
      .set({
        status: "processed",
        processedAt: new Date(),
        processingAttempts: sql`${rawEvents.processingAttempts} + 1`,
      })
      .where(eq(rawEvents.id, event.id));
    await tx
      .update(connections)
      .set({
        lastEventAt: new Date(),
        freshness: "live",
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, connection.id));
  });
  await recordMeasurementSafely(db, {
    organizationId: event.organizationId,
    connectionId: event.connectionId,
    name: "webhook_to_dashboard_ms",
    value: Math.max(0, Date.now() - event.receivedAt.getTime()),
    unit: "ms",
    safeDimensions: { provider: event.provider, eventType: event.eventType },
  });
}

export async function markDeadLetter(
  db: Database,
  rawEventId: string,
  message: string,
): Promise<void> {
  const [event] = await db.select().from(rawEvents).where(eq(rawEvents.id, rawEventId)).limit(1);
  if (!event) return;
  await db.transaction(async (tx) => {
    await tx
      .insert(deadLetterEvents)
      .values({
        organizationId: event.organizationId,
        rawEventId,
        errorCode: "normalization_failed",
        safeErrorMessage: message.slice(0, 500),
        attempts: event.processingAttempts + 1,
      })
      .onConflictDoNothing();
    await tx
      .update(rawEvents)
      .set({
        status: "dead_lettered",
        failureCode: "normalization_failed",
        failureMessage: message.slice(0, 500),
      })
      .where(eq(rawEvents.id, rawEventId));
  });
}
