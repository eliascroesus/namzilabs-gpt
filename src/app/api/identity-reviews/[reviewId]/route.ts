import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { resolveIdentityReview } from "@/server/identity/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("admin");
    const { reviewId } = await params;
    z.uuid().parse(reviewId);
    const body = z
      .object({
        decision: z.enum(["merged", "split", "dismissed"]),
        note: z.string().max(500).optional(),
      })
      .parse(await request.json());
    await resolveIdentityReview(getDb(), { tenant, reviewId, ...body });
    return new Response(null, { status: 204, headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
