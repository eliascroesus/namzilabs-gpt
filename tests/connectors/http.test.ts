import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

import { providerFetch } from "@/connectors/http";
import { AppError } from "@/lib/errors";

describe("provider HTTP reliability", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("honors Retry-After before retrying a rate-limited request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const resultPromise = providerFetch(
      "https://api.example.test/items",
      {},
      z.object({ ok: z.boolean() }),
      2,
    );
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({ ok: true });
  });

  it("classifies provider schema drift without returning the provider payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ renamed: true })));
    const promise = providerFetch(
      "https://api.example.test/items",
      {},
      z.object({ items: z.array(z.string()) }),
      1,
    );
    await expect(promise).rejects.toMatchObject({
      code: "provider_schema_changed",
      status: 502,
      details: { providerHost: "api.example.test" },
    } satisfies Partial<AppError>);
  });

  it("retries a transient network failure and returns a safe terminal error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket included a secret")));
    const promise = providerFetch(
      "https://api.example.test/items?token=must-not-leak",
      {},
      z.object({ ok: z.boolean() }),
      2,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await promise;
    expect(error).toMatchObject({
      code: "provider_unavailable",
      details: { providerHost: "api.example.test" },
    });
    expect((error as Error).message).not.toContain("must-not-leak");
  });
});
