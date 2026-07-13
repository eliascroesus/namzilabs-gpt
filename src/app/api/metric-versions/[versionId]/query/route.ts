import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { executeSavedMetricVersion, sourceFreshness } from "@/server/metrics/service";
import { recordMeasurementSafely } from "@/server/operations/service";

const bodySchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  timezone: z.string().min(1).max(100),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const versionId = z.uuid().parse((await params).versionId);
    const input = bodySchema.parse(await request.json());
    const window = {
      start: new Date(input.start),
      end: new Date(input.end),
      timezone: input.timezone,
    };
    const db = getDb();
    const [result, freshness] = await Promise.all([
      executeSavedMetricVersion(db, tenant.organizationId, versionId, window),
      sourceFreshness(db, tenant.organizationId),
    ]);
    await recordMeasurementSafely(db, {
      organizationId: tenant.organizationId,
      name: "dashboard_query_ms",
      value: Math.max(0, performance.now() - startedAt),
      unit: "ms",
      safeDimensions: { versionId },
    });
    return Response.json(
      { data: { ...result, freshness, lastUpdatedAt: new Date().toISOString() }, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
