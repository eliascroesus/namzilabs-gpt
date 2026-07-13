import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { auditLogs, dashboardCards, dashboards, metricVersions } from "@/db/schema";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import {
  dashboardMutationSchema,
  referencedMetricVersionIds,
} from "@/server/dashboards/validation";

export async function PUT(request: Request, context: { params: Promise<{ dashboardId: string }> }) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const dashboardId = (await context.params).dashboardId;
    const input = dashboardMutationSchema.parse(await request.json());
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
    const db = getDb();
    const data = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: dashboards.id })
        .from(dashboards)
        .where(
          and(eq(dashboards.id, dashboardId), eq(dashboards.organizationId, tenant.organizationId)),
        )
        .limit(1);
      if (!existing) throw new AppError("dashboard_not_found", "Dashboard not found.", 404);

      const referencedIds = referencedMetricVersionIds(input);
      const versions = referencedIds.length
        ? await tx
            .select({ id: metricVersions.id })
            .from(metricVersions)
            .where(
              and(
                eq(metricVersions.organizationId, tenant.organizationId),
                inArray(metricVersions.id, referencedIds),
                eq(metricVersions.status, "published"),
              ),
            )
        : [];
      if (versions.length !== referencedIds.length) {
        throw new AppError(
          "metric_version_not_found",
          "One or more published dashboard metrics could not be found.",
          404,
        );
      }

      const [dashboard] = await tx
        .update(dashboards)
        .set({
          name: input.name,
          description: input.description,
          timezone: input.timezone,
          defaultDateRange: input.defaultDateRange,
          updatedAt: new Date(),
        })
        .where(
          and(eq(dashboards.id, dashboardId), eq(dashboards.organizationId, tenant.organizationId)),
        )
        .returning();
      await tx
        .delete(dashboardCards)
        .where(
          and(
            eq(dashboardCards.dashboardId, dashboardId),
            eq(dashboardCards.organizationId, tenant.organizationId),
          ),
        );
      if (input.cards.length) {
        await tx.insert(dashboardCards).values(
          input.cards.map((card, position) => ({
            organizationId: tenant.organizationId,
            dashboardId,
            metricVersionId: card.metricVersionId,
            cardType: card.cardType,
            title: card.title,
            position,
            configuration: card.configuration,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "dashboard.updated",
        resourceType: "dashboard",
        resourceId: dashboardId,
        requestId,
        safeMetadata: { cardCount: input.cards.length },
      });
      return dashboard;
    });
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
