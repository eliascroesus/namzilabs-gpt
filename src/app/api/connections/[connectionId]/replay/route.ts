import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { deadLetterEvents, outboxEvents, rawEvents } from "@/db/schema";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { getConnectionForOrganization } from "@/server/connections/service";

const bodySchema = z.object({ rawEventId: z.uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const { connectionId } = await params;
    const { rawEventId } = bodySchema.parse(await request.json());
    const db = getDb();
    await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    const [event] = await db
      .select({ id: rawEvents.id })
      .from(rawEvents)
      .where(
        and(
          eq(rawEvents.organizationId, tenant.organizationId),
          eq(rawEvents.connectionId, connectionId),
          eq(rawEvents.id, rawEventId),
        ),
      )
      .limit(1);
    if (!event)
      return Response.json(
        { error: { code: "event_not_found", message: "Event not found." }, requestId },
        { status: 404 },
      );
    await db.transaction(async (tx) => {
      await tx
        .update(rawEvents)
        .set({ status: "pending", failureCode: null, failureMessage: null })
        .where(eq(rawEvents.id, rawEventId));
      await tx
        .delete(deadLetterEvents)
        .where(
          and(
            eq(deadLetterEvents.organizationId, tenant.organizationId),
            eq(deadLetterEvents.rawEventId, rawEventId),
          ),
        );
      await tx.insert(outboxEvents).values({
        organizationId: tenant.organizationId,
        aggregateType: "raw_event",
        aggregateId: rawEventId,
        eventName: "namzi/raw-event.received",
        payload: { rawEventId },
      });
    });
    return Response.json(
      { data: { rawEventId, status: "queued" }, requestId },
      { status: 202, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
