import { NextRequest, NextResponse } from "next/server";

import { prototypeSessionCookieName, verifyPrototypeSession } from "@/server/auth/password-session";
import { trustedRequestOrigin } from "@/server/security/csrf";

function workspaceContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function isPublicApi(pathname: string): boolean {
  return (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/inngest" ||
    pathname.startsWith("/api/webhooks/") ||
    /^\/api\/integrations\/(google|calendly|close)\/callback$/.test(pathname)
  );
}

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  if (isApi && isPublicApi(pathname)) return NextResponse.next();

  if (
    isApi &&
    !trustedRequestOrigin(request, request.nextUrl.origin, process.env.APP_ENV === "production")
  ) {
    return NextResponse.json(
      { error: { code: "csrf_rejected", message: "The request origin was not trusted." } },
      { status: 403 },
    );
  }

  const authenticated = verifyPrototypeSession(
    request.cookies.get(prototypeSessionCookieName)?.value,
    process.env.APP_PASSWORD,
  );
  if (isApi) {
    if (!authenticated) {
      return NextResponse.json(
        { error: { code: "authentication_required", message: "Sign in to continue." } },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Prototype login is not configured." }, { status: 503 });
  }
  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = crypto.randomUUID();
  const contentSecurityPolicy = workspaceContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/integrations/:path*",
    "/overview/:path*",
    "/settings/:path*",
    "/data/:path*",
    "/metrics/:path*",
    "/dashboards/:path*",
  ],
};
