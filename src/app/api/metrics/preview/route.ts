import { z } from "zod";

import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { executeDefinition } from "@/server/metrics/service";

const previewSchema = z.object({
  definition: z.unknown(),
  window: z.object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    timezone: z.string().min(1).max(100),
  }),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const input = previewSchema.parse(await request.json());
    const data = await executeDefinition(input.definition, tenant.organizationId, {
      start: new Date(input.window.start),
      end: new Date(input.window.end),
      timezone: input.window.timezone,
    });
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
