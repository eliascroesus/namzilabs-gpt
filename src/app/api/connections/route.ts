import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getConnector } from "@/connectors/registry";
import { providerIds } from "@/connectors/types";
import { getDb } from "@/db/client";
import { auditLogs, connections } from "@/db/schema";
import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { randomSecret } from "@/connectors/shared";
import { requireTenantContext } from "@/server/auth/tenant";
import { connectorContext } from "@/server/connections/service";
import { storeCredential } from "@/server/credentials/service";

const createSchema = z.object({
  provider: z.enum(providerIds),
  name: z.string().trim().min(1).max(100),
  apiKey: z.string().min(8).optional(),
  configuration: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const rows = await getDb()
      .select({
        id: connections.id,
        provider: connections.provider,
        name: connections.name,
        externalAccountName: connections.externalAccountName,
        status: connections.status,
        freshness: connections.freshness,
        lastEventAt: connections.lastEventAt,
        lastReconciledAt: connections.lastReconciledAt,
        lastErrorCode: connections.lastErrorCode,
      })
      .from(connections)
      .where(eq(connections.organizationId, tenant.organizationId))
      .orderBy(desc(connections.createdAt));
    return Response.json({ data: rows, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const input = createSchema.parse(await request.json());
    const connector = getConnector(input.provider);
    const db = getDb();
    const webhookSecret = randomSecret();
    const [connection] = await db
      .insert(connections)
      .values({
        organizationId: tenant.organizationId,
        provider: input.provider,
        name: input.name,
        apiVersion: connector.manifest.apiVersion,
        mappingVersion: connector.manifest.mappingVersion,
        configuration:
          input.provider === "webhook"
            ? {
                requireTimestamp: true,
                webhookToleranceSeconds: 300,
                ...input.configuration,
              }
            : input.configuration,
      })
      .returning();
    if (!connection) throw new Error("Connection insert failed");
    await storeCredential(db, {
      organizationId: tenant.organizationId,
      connectionId: connection.id,
      type: "webhookSecret",
      value: webhookSecret,
    });
    if (input.apiKey) {
      await storeCredential(db, {
        organizationId: tenant.organizationId,
        connectionId: connection.id,
        type: "apiKey",
        value: input.apiKey,
      });
      const context = await connectorContext(
        db,
        connection,
        `${env().APP_URL}/api/webhooks/${connection.id}`,
      );
      const identity = await connector.validateCredentials(context);
      if (identity.kind === "validated") {
        await db
          .update(connections)
          .set({
            externalAccountId: identity.externalAccountId,
            externalAccountName: identity.externalAccountName,
            status: "active",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(connections.organizationId, tenant.organizationId),
              eq(connections.id, connection.id),
            ),
          );
      }
    }
    if (input.provider === "webhook") {
      await db
        .update(connections)
        .set({
          externalAccountId: connection.id,
          externalAccountName: "Webhook endpoint",
          status: "active",
          freshness: "live",
          updatedAt: new Date(),
        })
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
      action: "connection.created",
      resourceType: "connection",
      resourceId: connection.id,
      requestId,
      safeMetadata: { provider: input.provider },
    });
    return Response.json(
      {
        data: {
          id: connection.id,
          status: input.apiKey || input.provider === "webhook" ? "active" : "draft",
          ...(input.provider === "webhook"
            ? {
                webhookUrl: `${env().APP_URL}/api/webhooks/${connection.id}`,
                webhookSecret,
              }
            : {}),
        },
        requestId,
      },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
