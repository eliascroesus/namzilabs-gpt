"use client";

import { LockKeyhole } from "lucide-react";
import { useState } from "react";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next: nextPath }),
      });
      const result = (await response.json()) as {
        data?: { next?: string };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Sign in failed.");
      window.location.assign(result.data?.next ?? "/overview");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign in failed.");
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="shell-card mt-7 p-6 sm:p-8">
      <label htmlFor="password" className="block text-sm font-semibold">
        Prototype password
      </label>
      <div className="relative mt-2">
        <LockKeyhole
          size={17}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3 text-[var(--muted)]"
        />
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-lg border border-[var(--line)] bg-white pl-10 pr-3 outline-none focus:border-[var(--brand)]"
        />
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={working || password.length === 0}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {working ? "Signing in…" : "Open workspace"}
      </button>
    </form>
  );
}
