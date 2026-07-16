import { and, eq } from "drizzle-orm";

import { getConnector } from "@/connectors/registry";
import type { Database } from "@/db/client";
import { connections, outboxEvents, webhookSubscriptions } from "@/db/schema";
import { asProviderId, connectorContext } from "@/server/connections/service";
import { storeCredential } from "@/server/credentials/service";

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Webhook provisioning failed.").slice(0, 300);
}

export async function provisionConnectedAccount(
  db: Database,
  connection: typeof connections.$inferSelect,
  callbackUrl: string,
): Promise<{ subscription: "active" | "polling" | "delayed"; syncQueued: boolean }> {
  const connector = getConnector(asProviderId(connection.provider));
  let subscription: "active" | "polling" | "delayed" = connector.manifest.capabilities.includes(
    "webhooks",
  )
    ? "delayed"
    : "polling";

  if (connector.manifest.capabilities.includes("webhooks")) {
    const [existing] = await db
      .select({ id: webhookSubscriptions.id })
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.organizationId, connection.organizationId),
          eq(webhookSubscriptions.connectionId, connection.id),
          eq(webhookSubscriptions.active, true),
        ),
      )
      .limit(1);
    if (existing) {
      subscription = "active";
    } else {
      try {
        const context = await connectorContext(db, connection, callbackUrl);
        const created = await connector.createSubscription(context);
        for (const [type, value] of Object.entries(created.credentialUpdates ?? {})) {
          await storeCredential(db, {
            organizationId: connection.organizationId,
            connectionId: connection.id,
            type,
            value,
          });
        }
        await db.insert(webhookSubscriptions).values({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          externalId: created.externalId,
          resourceId: created.resourceId,
          events: [...connector.manifest.events],
          expiresAt: created.expiresAt ? new Date(created.expiresAt) : undefined,
          metadata: created.metadata ?? {},
          active: true,
        });
        subscription = "active";
      } catch (error) {
        await db
          .update(connections)
          .set({
            freshness: "delayed",
            lastErrorCode: "webhook_provisioning_failed",
            lastErrorMessage: safeMessage(error),
            updatedAt: new Date(),
          })
          .where(eq(connections.id, connection.id));
      }
    }
  }

  const shouldQueueSync =
    connector.manifest.capabilities.includes("backfill") && connection.provider !== "google-sheets";
  if (shouldQueueSync) {
    await db.insert(outboxEvents).values({
      organizationId: connection.organizationId,
      aggregateType: "connection",
      aggregateId: connection.id,
      eventName: "namzi/connection.reconcile",
      payload: { connectionId: connection.id },
    });
  }
  return { subscription, syncQueued: shouldQueueSync };
}
