import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PublicHeader() {
  return (
    <header className="border-b border-[var(--line)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3 font-bold" aria-label="Namzi Data home">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-white">
            N
          </span>
          <span>
            <span className="block leading-4">Namzi Data</span>
            <span className="block text-[10px] font-medium text-[var(--muted)]">by Namzi Labs</span>
          </span>
        </Link>
        <nav aria-label="Public navigation" className="flex items-center gap-4 text-sm">
          <Link
            href="/privacy"
            className="hidden text-[var(--muted)] hover:text-[var(--foreground)] sm:block"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hidden text-[var(--muted)] hover:text-[var(--foreground)] sm:block"
          >
            Terms
          </Link>
          <Link
            href="/overview"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 font-semibold text-white"
          >
            Open workspace <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--foreground)]">Namzi Data</p>
          <p className="mt-1">Unified, traceable operational analytics.</p>
        </div>
        <nav aria-label="Legal navigation" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-[var(--foreground)]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-[var(--foreground)]">
            Terms of Service
          </Link>
          <a href="mailto:support@namzilabs.co" className="hover:text-[var(--foreground)]">
            Contact
          </a>
        </nav>
        <p>© {new Date().getUTCFullYear()} Namzi Labs</p>
      </div>
    </footer>
  );
}

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <p className="text-sm font-semibold text-[var(--brand)]">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">Last updated: {updated}</p>
        <article className="legal-copy mt-10">{children}</article>
      </main>
      <PublicFooter />
    </div>
  );
}
