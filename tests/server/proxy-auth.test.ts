import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import proxy from "@/proxy";
import { createPrototypeSession, prototypeSessionCookieName } from "@/server/auth/password-session";

describe("prototype password proxy", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.APP_URL = "http://localhost:3000";
    process.env.APP_PASSWORD = "prototype-test-password";
  });

  afterEach(() => {
    delete process.env.APP_PASSWORD;
  });

  it("redirects an unauthenticated app page to login with a local return path", () => {
    const response = proxy(new NextRequest("http://localhost:3000/metrics/new?source=test"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fmetrics%2Fnew%3Fsource%3Dtest",
    );
  });

  it("rejects an unauthenticated app API before route code executes", () => {
    const response = proxy(new NextRequest("http://localhost:3000/api/metrics"));
    expect(response.status).toBe(401);
  });

  it("accepts a correctly signed cookie without exposing the password", () => {
    const session = createPrototypeSession(process.env.APP_PASSWORD!);
    const request = new NextRequest("http://localhost:3000/metrics/new", {
      headers: { cookie: `${prototypeSessionCookieName}=${session}` },
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("strict-dynamic");
  });

  it("keeps provider callbacks and webhook receivers public", () => {
    expect(
      proxy(
        new NextRequest(
          "http://localhost:3000/api/integrations/google/callback?code=test&state=test",
        ),
      ).status,
    ).toBe(200);
    expect(proxy(new NextRequest("http://localhost:3000/api/webhooks/connection-id")).status).toBe(
      200,
    );
  });

  it("allows the prototype login from the domain currently serving the page", () => {
    process.env.APP_ENV = "production";
    process.env.APP_URL = "https://namzilabs.co";
    const request = new NextRequest("https://namzilabs-preview.vercel.app/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://namzilabs-preview.vercel.app",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(proxy(request).status).toBe(200);
  });

  it("keeps the origin check on protected mutation APIs", () => {
    process.env.APP_ENV = "production";
    process.env.APP_URL = "https://namzilabs.co";
    const request = new NextRequest("https://namzilabs-preview.vercel.app/api/connections", {
      method: "POST",
      headers: {
        origin: "https://namzilabs-preview.vercel.app",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(proxy(request).status).toBe(403);
  });
});
