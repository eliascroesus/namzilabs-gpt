import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import { ingestWebhook } from "@/server/ingestion/service";

async function receive(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
  bodyOverride?: string,
) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    const { connectionId } = await params;
    const rawBody = bodyOverride ?? (await request.text());
    const result = await ingestWebhook(getDb(), {
      connectionId,
      request: { rawBody, headers: request.headers, url: request.url },
      appUrl: env().APP_URL,
      startedAt,
    });
    return Response.json(
      { ...result, status: "success", requestId },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  return receive(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  return receive(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  return receive(request, context);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  const url = new URL(request.url);
  if (url.searchParams.size === 0) {
    return Response.json(
      { status: "ready", message: "Namzi catch hook is listening." },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  const forwarded = new Request(request.url, { method: "POST", headers });
  return receive(forwarded, context, JSON.stringify(Object.fromEntries(url.searchParams)));
}
