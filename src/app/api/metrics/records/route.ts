import { z } from "zod";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { matchingRecords } from "@/server/metrics/service";

const schema = z.object({
  definition: z.unknown(),
  window: z.object({ start: z.iso.datetime(), end: z.iso.datetime(), timezone: z.string() }),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext();
    const input = schema.parse(await request.json());
    const rows = await matchingRecords(
      input.definition,
      tenant.organizationId,
      {
        start: new Date(input.window.start),
        end: new Date(input.window.end),
        timezone: input.window.timezone,
      },
      { limit: input.limit, offset: input.offset },
    );
    return Response.json(
      { data: Array.from(rows), requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
