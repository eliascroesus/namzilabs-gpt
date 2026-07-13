import { z } from "zod";

import { AppError } from "@/lib/errors";

const MAX_ATTEMPTS = 5;

export function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 60_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 60_000));
  }
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(2 ** attempt * 500 + jitter, 30_000);
}

export async function providerFetch<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  attempts = MAX_ATTEMPTS,
): Promise<T> {
  let lastStatus = 0;
  const providerHost = new URL(url).hostname;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      if (attempt === attempts - 1) {
        throw new AppError(
          "provider_unavailable",
          "The provider could not be reached after multiple attempts.",
          502,
          { providerHost },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, null)));
      continue;
    }
    lastStatus = response.status;
    if (response.ok) {
      let json: unknown;
      try {
        json = response.status === 204 ? {} : await response.json();
      } catch {
        throw new AppError(
          "provider_schema_changed",
          "The provider returned a response that was not valid JSON.",
          502,
          { providerHost },
        );
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new AppError(
          "provider_schema_changed",
          "The provider response no longer matches the supported contract.",
          502,
          {
            providerHost,
            issues: parsed.error.issues.slice(0, 10).map(({ path, code }) => ({ path, code })),
          },
        );
      }
      return parsed.data;
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === attempts - 1) {
      throw new AppError(
        "provider_request_failed",
        `The provider returned HTTP ${response.status}.`,
        response.status === 401 || response.status === 403 ? 401 : 502,
        { providerStatus: response.status },
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, retryDelay(attempt, response.headers.get("retry-after"))),
    );
  }
  throw new AppError("provider_unavailable", `The provider returned HTTP ${lastStatus}.`, 502);
}

export function bearerHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}
