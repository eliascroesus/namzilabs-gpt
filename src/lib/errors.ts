import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function requestIdFrom(request: Request): string {
  return request.headers.get("x-request-id") ?? randomUUID();
}

export function errorResponse(error: unknown, requestId: string): NextResponse {
  const normalized =
    error instanceof AppError
      ? error
      : error instanceof z.ZodError
        ? new AppError("invalid_request", "The request was not valid.", 400, {
            issues: error.issues.map(({ path, message }) => ({ path, message })),
          })
        : new AppError("internal_error", "The request could not be completed.", 500);

  return NextResponse.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
      requestId,
    },
    { status: normalized.status, headers: { "x-request-id": requestId } },
  );
}
