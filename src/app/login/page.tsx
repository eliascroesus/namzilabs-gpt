import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";
import { PublicFooter, PublicHeader } from "@/components/public-site";
import { safeNextPath } from "@/server/auth/password-session";

export const metadata: Metadata = {
  title: "Prototype login",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = safeNextPath((await searchParams).next);
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-14">
        <p className="text-sm font-semibold text-[var(--brand)]">Private prototype</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Open Namzi Data</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Enter the shared prototype password. This wall is intentionally simple and is not a
          customer authentication system.
        </p>
        <LoginForm nextPath={nextPath} />
      </main>
      <PublicFooter />
    </div>
  );
}
