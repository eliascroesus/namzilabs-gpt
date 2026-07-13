import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { errorResponse, requestIdFrom } from "@/lib/errors";
import {
  createPrototypeSession,
  passwordMatches,
  prototypeSessionCookieName,
  prototypeSessionMaxAgeSeconds,
  safeNextPath,
} from "@/server/auth/password-session";

const loginSchema = z.object({
  password: z.string().min(1).max(256),
  next: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const config = env();
    if (!config.APP_PASSWORD) {
      return NextResponse.json(
        { error: { code: "login_not_configured", message: "Login is not configured." }, requestId },
        { status: 503, headers: { "x-request-id": requestId } },
      );
    }
    const input = loginSchema.parse(await request.json());
    if (!passwordMatches(input.password, config.APP_PASSWORD)) {
      return NextResponse.json(
        { error: { code: "invalid_password", message: "The password was incorrect." }, requestId },
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }
    const response = NextResponse.json(
      { data: { next: safeNextPath(input.next) }, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
    response.cookies.set(prototypeSessionCookieName, createPrototypeSession(config.APP_PASSWORD), {
      httpOnly: true,
      secure: config.APP_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: prototypeSessionMaxAgeSeconds,
    });
    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
