import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { createMetricDraft } from "@/server/metrics/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ metricId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const { metricId } = await params;
    z.uuid().parse(metricId);
    const body = z.object({ definition: z.unknown() }).parse(await request.json());
    const data = await createMetricDraft(getDb(), {
      tenant,
      metricId,
      definition: body.definition,
    });
    return Response.json(
      { data, requestId },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
