import { getDb } from "@/db/client";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { operationsSnapshot } from "@/server/operations/service";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("admin");
    const data = await operationsSnapshot(getDb(), tenant.organizationId);
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
