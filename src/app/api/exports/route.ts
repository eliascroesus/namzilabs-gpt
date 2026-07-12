import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { auditLogs, exportJobs, outboxEvents } from "@/db/schema";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";

const createSchema = z.object({
  dataset: z.enum(["source_records", "canonical_entities", "activity_facts", "raw_events"]),
  query: z.record(z.string(), z.unknown()).default({}),
});
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const rows = await getDb()
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.organizationId, tenant.organizationId))
      .orderBy(desc(exportJobs.createdAt))
      .limit(25);
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
    const data = await getDb().transaction(async (tx) => {
      const [job] = await tx
        .insert(exportJobs)
        .values({
          organizationId: tenant.organizationId,
          requestedByUserId: tenant.userId,
          dataset: input.dataset,
          query: input.query,
        })
        .returning();
      if (!job) throw new Error("Export job insert failed");
      await tx.insert(outboxEvents).values({
        organizationId: tenant.organizationId,
        aggregateType: "export_job",
        aggregateId: job.id,
        eventName: "namzi/export.requested",
        payload: { exportJobId: job.id },
      });
      await tx.insert(auditLogs).values({
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action: "export.queued",
        resourceType: "export_job",
        resourceId: job.id,
        requestId,
        safeMetadata: { dataset: input.dataset },
      });
      return job;
    });
    return Response.json(
      { data, requestId },
      { status: 202, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
