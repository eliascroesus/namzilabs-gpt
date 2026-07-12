import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

let workosHandler: ReturnType<typeof authkitMiddleware> | undefined;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (
    !process.env.WORKOS_API_KEY ||
    !process.env.WORKOS_CLIENT_ID ||
    !process.env.WORKOS_COOKIE_PASSWORD
  ) {
    if (process.env.APP_ENV === "production") {
      return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    }
    return NextResponse.next();
  }
  workosHandler ??= authkitMiddleware({
    middlewareAuth: { enabled: true, unauthenticatedPaths: [] },
  });
  return workosHandler(request, event);
}

export const config = {
  matcher: [
    "/integrations/:path*",
    "/overview/:path*",
    "/settings/:path*",
    "/data/:path*",
    "/metrics/:path*",
    "/dashboards/:path*",
  ],
};
