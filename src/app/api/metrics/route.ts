import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { metrics } from "@/db/schema";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { createMetric } from "@/server/metrics/service";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  definition: z.unknown(),
});

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const rows = await getDb()
      .select()
      .from(metrics)
      .where(and(eq(metrics.organizationId, tenant.organizationId), isNull(metrics.archivedAt)))
      .orderBy(desc(metrics.updatedAt));
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
    const data = await createMetric(getDb(), { tenant, ...input });
    return Response.json(
      { data, requestId },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
