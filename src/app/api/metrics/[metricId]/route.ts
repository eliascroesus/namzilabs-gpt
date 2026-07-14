import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { auditLogs, metrics } from "@/db/schema";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ metricId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const metricId = z.uuid().parse((await params).metricId);
    const input = updateSchema.parse(await request.json());
    const db = getDb();
    const [metric] = await db
      .update(metrics)
      .set({ name: input.name, description: input.description, updatedAt: new Date() })
      .where(and(eq(metrics.organizationId, tenant.organizationId), eq(metrics.id, metricId)))
      .returning();
    if (!metric) throw new AppError("metric_not_found", "Metric not found.", 404);
    await db.insert(auditLogs).values({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      action: "metric.updated",
      resourceType: "metric",
      resourceId: metric.id,
      requestId,
    });
    return Response.json({ data: metric, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error("metric_update_failed", { requestId, error });
    }
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ metricId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const metricId = z.uuid().parse((await params).metricId);
    const db = getDb();
    const [metric] = await db
      .select({ id: metrics.id, name: metrics.name, archivedAt: metrics.archivedAt })
      .from(metrics)
      .where(and(eq(metrics.organizationId, tenant.organizationId), eq(metrics.id, metricId)))
      .limit(1);
    if (!metric) throw new AppError("metric_not_found", "Metric not found.", 404);

    if (metric.archivedAt) {
      return Response.json(
        { data: { id: metricId, deleted: true }, requestId },
        { headers: { "x-request-id": requestId } },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(metrics)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(metrics.organizationId, tenant.organizationId), eq(metrics.id, metricId)));
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "metric.archived",
        resourceType: "metric",
        resourceId: metricId,
        requestId,
        safeMetadata: { name: metric.name },
      });
    });
    return Response.json(
      { data: { id: metricId, deleted: true }, requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error("metric_delete_failed", { requestId, error });
    }
    return errorResponse(error, requestId);
  }
}
