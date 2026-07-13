import { NextResponse } from "next/server";

import { requestIdFrom } from "@/lib/errors";
import { prototypeSessionCookieName } from "@/server/auth/password-session";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const response = NextResponse.json(
    { data: { signedOut: true }, requestId },
    { headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
  response.cookies.set(prototypeSessionCookieName, "", {
    httpOnly: true,
    secure: process.env.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
