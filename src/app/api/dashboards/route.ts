import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs, dashboardCards, dashboards, metricVersions } from "@/db/schema";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(""),
  timezone: z.string().min(1).max(100),
  defaultDateRange: z
    .enum(["last_7_days", "last_30_days", "this_month", "this_quarter"])
    .default("last_30_days"),
  cards: z
    .array(
      z.object({
        metricVersionId: z.uuid(),
        cardType: z.enum(["kpi", "time_series", "funnel", "breakdown", "goal"]),
        title: z.string().min(1).max(100),
        configuration: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(30)
    .default([]),
});
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const rows = await getDb()
      .select()
      .from(dashboards)
      .where(eq(dashboards.organizationId, tenant.organizationId))
      .orderBy(desc(dashboards.updatedAt));
    return Response.json(
      { data: rows, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const input = createSchema.parse(await request.json());
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
    const db = getDb();
    const data = await db.transaction(async (tx) => {
      for (const card of input.cards) {
        const [version] = await tx
          .select({ id: metricVersions.id })
          .from(metricVersions)
          .where(
            and(
              eq(metricVersions.organizationId, tenant.organizationId),
              eq(metricVersions.id, card.metricVersionId),
              eq(metricVersions.status, "published"),
            ),
          )
          .limit(1);
        if (!version)
          throw new AppError(
            "metric_version_not_found",
            "Published metric version not found.",
            404,
          );
      }
      const [dashboard] = await tx
        .insert(dashboards)
        .values({
          organizationId: tenant.organizationId,
          name: input.name,
          description: input.description,
          timezone: input.timezone,
          defaultDateRange: input.defaultDateRange,
          createdByUserId: tenant.userId,
        })
        .returning();
      if (!dashboard) throw new Error("Dashboard insert failed");
      if (input.cards.length)
        await tx.insert(dashboardCards).values(
          input.cards.map((card, index) => ({
            organizationId: tenant.organizationId,
            dashboardId: dashboard.id,
            metricVersionId: card.metricVersionId,
            cardType: card.cardType,
            title: card.title,
            position: index,
            configuration: card.configuration,
          })),
        );
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "dashboard.created",
        resourceType: "dashboard",
        resourceId: dashboard.id,
        requestId,
        safeMetadata: { cardCount: input.cards.length },
      });
      return dashboard;
    });
    return Response.json(
      { data, requestId },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
