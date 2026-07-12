import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs, goals, metricVersions } from "@/db/schema";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";

const schema = z
  .object({
    metricVersionId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    targetValue: z.number().finite(),
    direction: z.enum(["at_least", "at_most"]),
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
  })
  .refine((value) => new Date(value.periodStart) < new Date(value.periodEnd), {
    message: "The reporting period is invalid.",
  });
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const rows = await getDb()
      .select()
      .from(goals)
      .where(eq(goals.organizationId, tenant.organizationId))
      .orderBy(desc(goals.createdAt));
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
    const input = schema.parse(await request.json());
    const db = getDb();
    const [version] = await db
      .select({ id: metricVersions.id })
      .from(metricVersions)
      .where(
        and(
          eq(metricVersions.organizationId, tenant.organizationId),
          eq(metricVersions.id, input.metricVersionId),
          eq(metricVersions.status, "published"),
        ),
      )
      .limit(1);
    if (!version)
      throw new AppError("metric_version_not_found", "Published metric version not found.", 404);
    const [goal] = await db
      .insert(goals)
      .values({
        organizationId: tenant.organizationId,
        metricVersionId: version.id,
        name: input.name,
        targetValue: String(input.targetValue),
        direction: input.direction,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        createdByUserId: tenant.userId,
      })
      .returning();
    if (!goal) throw new Error("Goal insert failed");
    await db.insert(auditLogs).values({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      action: "goal.created",
      resourceType: "goal",
      resourceId: goal.id,
      requestId,
      safeMetadata: { metricVersionId: version.id, direction: input.direction },
    });
    return Response.json(
      { data: goal, requestId },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
