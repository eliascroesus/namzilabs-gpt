"use client";

import { useEffect } from "react";

/**
 * Segment-level error boundary for the workspace. A failed data query while
 * rendering a dashboard page (for example an unreachable database, or one that
 * has not had migrations applied) is contained here inside the app shell,
 * instead of bubbling to the root `global-error` boundary and replacing the
 * whole document with an opaque message. The `digest` matches the hashed error
 * recorded in the server logs, so support can correlate the two.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="shell-card p-8 text-center">
        <h1 className="text-xl font-bold">We couldn’t load your workspace data</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          You are signed in, but this request could not be completed. This is usually a database
          that is unreachable or has not had its migrations applied yet. Check the server logs for
          the underlying error, then try again.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
