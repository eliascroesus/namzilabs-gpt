import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { ingestWebhook } from "@/server/ingestion/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { connectionId } = await params;
    const rawBody = await request.text();
    const result = await ingestWebhook(getDb(), {
      connectionId,
      request: { rawBody, headers: request.headers },
      appUrl: env().APP_URL,
    });
    return Response.json(
      { ...result, requestId },
      { status: 202, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
