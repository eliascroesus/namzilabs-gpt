"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <main className="grid min-h-screen place-items-center p-6">
          <div className="shell-card max-w-md p-8 text-center">
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              The request could not be completed. Try again, and contact support if the problem
              continues.
            </p>
            {error.digest ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            ) : null}
            <button
              onClick={reset}
              className="mt-5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
