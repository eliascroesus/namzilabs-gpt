import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { auditLogs, dashboardCards, goals, metrics, metricVersions } from "@/db/schema";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { parseMetricDefinition } from "@/server/metrics/dsl";

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
      .select({ id: metrics.id, name: metrics.name })
      .from(metrics)
      .where(and(eq(metrics.organizationId, tenant.organizationId), eq(metrics.id, metricId)))
      .limit(1);
    if (!metric) throw new AppError("metric_not_found", "Metric not found.", 404);

    const [versionRows, otherVersions] = await Promise.all([
      db
        .select({ id: metricVersions.id })
        .from(metricVersions)
        .where(
          and(
            eq(metricVersions.organizationId, tenant.organizationId),
            eq(metricVersions.metricId, metricId),
          ),
        ),
      db
        .select({
          metricName: metrics.name,
          definition: metricVersions.definition,
        })
        .from(metricVersions)
        .innerJoin(metrics, eq(metrics.id, metricVersions.metricId))
        .where(
          and(
            eq(metricVersions.organizationId, tenant.organizationId),
            ne(metricVersions.metricId, metricId),
          ),
        ),
    ]);
    const versionIds = new Set(versionRows.map((version) => version.id));
    const dependent = otherVersions.find((version) => {
      try {
        const definition = parseMetricDefinition(version.definition);
        return (
          definition.measure.operation === "ratio" &&
          (versionIds.has(definition.measure.numeratorMetricVersionId) ||
            versionIds.has(definition.measure.denominatorMetricVersionId))
        );
      } catch {
        return false;
      }
    });
    if (dependent) {
      throw new AppError(
        "metric_in_use",
        `Delete or edit the dependent metric “${dependent.metricName}” first.`,
        409,
      );
    }

    await db.transaction(async (tx) => {
      if (versionRows.length) {
        const ids = versionRows.map((version) => version.id);
        await tx
          .delete(dashboardCards)
          .where(
            and(
              eq(dashboardCards.organizationId, tenant.organizationId),
              inArray(dashboardCards.metricVersionId, ids),
            ),
          );
        await tx
          .delete(goals)
          .where(
            and(
              eq(goals.organizationId, tenant.organizationId),
              inArray(goals.metricVersionId, ids),
            ),
          );
      }
      await tx
        .delete(metrics)
        .where(and(eq(metrics.organizationId, tenant.organizationId), eq(metrics.id, metricId)));
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "metric.deleted",
        resourceType: "metric",
        resourceId: metricId,
        requestId,
        safeMetadata: { name: metric.name, versionsDeleted: versionRows.length },
      });
    });
    return Response.json(
      { data: { id: metricId, deleted: true }, requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
