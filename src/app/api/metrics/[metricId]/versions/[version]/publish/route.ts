import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { publishMetricVersion } from "@/server/metrics/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ metricId: string; version: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const parameters = await params;
    const metricId = z.uuid().parse(parameters.metricId);
    const version = z.coerce.number().int().positive().parse(parameters.version);
    const data = await publishMetricVersion(getDb(), { tenant, metricId, version });
    return Response.json({ data, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
