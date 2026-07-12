import { z } from "zod";

import { getDb } from "@/db/client";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { setIdentityLock } from "@/server/identity/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("admin");
    const entityId = z.uuid().parse((await params).entityId);
    const { locked } = z.object({ locked: z.boolean() }).parse(await request.json());
    await setIdentityLock(getDb(), { tenant, entityId, locked });
    return new Response(null, { status: 204, headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
