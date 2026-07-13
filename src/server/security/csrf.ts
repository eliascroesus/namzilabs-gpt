import { AppError } from "@/lib/errors";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function trustedRequestOrigin(
  request: Pick<Request, "method" | "headers" | "url">,
  appUrl: string,
  requireOrigin = true,
): boolean {
  if (safeMethods.has(request.method.toUpperCase())) return true;
  const expected = new URL(appUrl).origin;
  const supplied = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  if (!supplied) return !requireOrigin && fetchSite !== "cross-site";
  try {
    return new URL(supplied).origin === expected;
  } catch {
    return false;
  }
}

export function assertTrustedRequestOrigin(
  request: Pick<Request, "method" | "headers" | "url">,
  appUrl: string,
  requireOrigin = true,
): void {
  if (!trustedRequestOrigin(request, appUrl, requireOrigin)) {
    throw new AppError("csrf_rejected", "The request origin was not trusted.", 403);
  }
}
