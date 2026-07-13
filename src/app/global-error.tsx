"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
