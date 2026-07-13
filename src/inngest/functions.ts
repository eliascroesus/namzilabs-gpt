import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { cron, eventType } from "inngest";
import { z } from "zod";

import { getDb } from "@/db/client";
import { operationalMeasurements, outboxEvents } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { markDeadLetter, processRawEvent } from "@/server/ingestion/service";
import { env } from "@/lib/env";
import { connections, webhookSubscriptions } from "@/db/schema";
import {
  reconcilePage,
  renewExpiringSubscription,
  shouldRenewSubscription,
} from "@/server/reconciliation/service";

const rawEventReceived = eventType("namzi/raw-event.received", {
  schema: z.object({ rawEventId: z.string().uuid() }),
});
const functionFailed = eventType("inngest/function.failed", {
  schema: z.object({
    event: z
      .object({ data: z.object({ rawEventId: z.string().uuid().optional() }).optional() })
      .optional(),
  }),
});
const connectionReconcile = eventType("namzi/connection.reconcile", {
  schema: z.object({
    connectionId: z.string().uuid(),
    cursor: z.string().optional(),
    runId: z.string().uuid().optional(),
  }),
});

export const processRawEventFunction = inngest.createFunction(
  { id: "process-raw-event", retries: 5, concurrency: { limit: 10 }, triggers: [rawEventReceived] },
  async ({ event, step }) => {
    const rawEventId = String(event.data.rawEventId);
    await step.run("normalize-and-store", async () => processRawEvent(getDb(), rawEventId));
    return { rawEventId };
  },
);

export const deadLetterFunction = inngest.createFunction(
  { id: "dead-letter-failed-event", retries: 2, triggers: [functionFailed] },
  async ({ event, step }) => {
    const failedEvent = event.data.event;
    const rawEventId = failedEvent?.data?.rawEventId;
    if (!rawEventId) return { ignored: true };
    await step.run("record-dead-letter", async () =>
      markDeadLetter(getDb(), rawEventId, "Processing failed after all retries."),
    );
    return { rawEventId };
  },
);

export const dispatchOutboxFunction = inngest.createFunction(
  { id: "dispatch-outbox", retries: 3, concurrency: { limit: 1 }, triggers: [cron("* * * * *")] },
  async ({ step }) => {
    const rows = await step.run("load-outbox", async () =>
      getDb()
        .select()
        .from(outboxEvents)
        .where(and(isNull(outboxEvents.publishedAt), lte(outboxEvents.availableAt, new Date())))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(100),
    );
    let published = 0;
    for (const row of rows) {
      await step.run(`publish-${row.id}`, async () => {
        try {
          await inngest.send({ id: row.id, name: row.eventName, data: row.payload });
          await getDb()
            .update(outboxEvents)
            .set({ publishedAt: new Date(), lastError: null })
            .where(eq(outboxEvents.id, row.id));
          published += 1;
        } catch (error) {
          const delaySeconds = Math.min(2 ** row.attempts * 5, 3_600);
          await getDb()
            .update(outboxEvents)
            .set({
              attempts: sql`${outboxEvents.attempts} + 1`,
              availableAt: new Date(Date.now() + delaySeconds * 1_000),
              lastError: error instanceof Error ? error.message.slice(0, 300) : "Dispatch failed",
            })
            .where(eq(outboxEvents.id, row.id));
          throw error;
        }
      });
    }
    return { published };
  },
);

export const reconcileConnectionFunction = inngest.createFunction(
  {
    id: "reconcile-connection",
    retries: 5,
    concurrency: { limit: 1, key: "event.data.connectionId" },
    triggers: [connectionReconcile],
  },
  async ({ event, step }) => {
    let cursor: string | undefined = event.data.cursor;
    let runId: string | undefined = event.data.runId;
    let pages = 0;
    let recordsWritten = 0;
    let recordsDeleted = 0;
    do {
      const page = await step.run(`reconcile-page-${pages}`, async () =>
        reconcilePage(getDb(), {
          connectionId: event.data.connectionId,
          cursor,
          runId,
          callbackUrl: `${env().APP_URL}/api/webhooks/${event.data.connectionId}`,
        }),
      );
      cursor = page.nextCursor ?? undefined;
      runId = page.runId;
      recordsWritten += page.recordsWritten;
      recordsDeleted += page.recordsDeleted;
      pages += 1;
    } while (cursor && pages < 100);
    if (cursor && runId) {
      await step.sendEvent("continue-reconciliation", {
        name: "namzi/connection.reconcile",
        data: { connectionId: event.data.connectionId, cursor, runId },
      });
    }
    return {
      pages,
      recordsWritten,
      recordsDeleted,
      continuationRequired: Boolean(cursor),
    };
  },
);

export const scheduleReconciliationFunction = inngest.createFunction(
  { id: "schedule-reconciliation", retries: 3, triggers: [cron("*/15 * * * *")] },
  async ({ step }) => {
    const active = await step.run("load-active-connections", async () =>
      getDb()
        .select({ id: connections.id })
        .from(connections)
        .where(inArray(connections.status, ["active", "delayed", "error"])),
    );
    await step.sendEvent(
      "fan-out-reconciliation",
      active.map((connection) => ({
        name: "namzi/connection.reconcile",
        data: { connectionId: connection.id },
      })),
    );
    return { scheduled: active.length };
  },
);

export const purgeOperationalMeasurementsFunction = inngest.createFunction(
  { id: "purge-operational-measurements", retries: 3, triggers: [cron("15 3 * * *")] },
  async ({ step }) => {
    const removed = await step.run("purge-expired-measurements", async () =>
      getDb()
        .delete(operationalMeasurements)
        .where(lt(operationalMeasurements.recordedAt, new Date(Date.now() - 30 * 86_400_000)))
        .returning({ id: operationalMeasurements.id }),
    );
    return { removed: removed.length };
  },
);

export const renewSubscriptionsFunction = inngest.createFunction(
  { id: "renew-expiring-subscriptions", retries: 5, triggers: [cron("0 */6 * * *")] },
  async ({ step }) => {
    const subscriptions = await step.run("load-expiring-subscriptions", async () =>
      getDb().select().from(webhookSubscriptions).where(eq(webhookSubscriptions.active, true)),
    );
    let renewed = 0;
    for (const subscription of subscriptions.filter((row) =>
      shouldRenewSubscription(row.expiresAt),
    )) {
      await step.run(`renew-${subscription.id}`, async () =>
        renewExpiringSubscription(
          getDb(),
          subscription.id,
          `${env().APP_URL}/api/webhooks/${subscription.connectionId}`,
        ),
      );
      renewed += 1;
    }
    return { renewed };
  },
);

export const inngestFunctions = [
  processRawEventFunction,
  deadLetterFunction,
  dispatchOutboxFunction,
  reconcileConnectionFunction,
  scheduleReconciliationFunction,
  renewSubscriptionsFunction,
  purgeOperationalMeasurementsFunction,
];
