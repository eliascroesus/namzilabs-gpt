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
    return errorResponse(error, requestId);
  }
}
