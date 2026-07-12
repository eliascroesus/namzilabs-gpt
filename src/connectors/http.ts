import { z } from "zod";

import { AppError } from "@/lib/errors";

const MAX_ATTEMPTS = 5;

function retryDelay(attempt: number, retryAfter: string | null): number {
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
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, init);
    lastStatus = response.status;
    if (response.ok) {
      const json: unknown = response.status === 204 ? {} : await response.json();
      return schema.parse(json);
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
