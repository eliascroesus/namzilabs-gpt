"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConnectionCard({
  connection,
}: {
  connection: {
    id: string;
    name: string;
    provider: string;
    accountName: string | null;
    status: string;
    freshness: string;
    logo: string;
  };
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const healthy =
    connection.status === "active" && !["delayed", "unavailable"].includes(connection.freshness);

  async function deleteConnection() {
    if (
      !window.confirm(
        `Permanently delete “${connection.name}”? Its stored records and credentials will also be removed.`,
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/connections/${connection.id}?deleteData=true`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message ?? "The integration could not be deleted.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The integration could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <article className="shell-card group relative p-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
      <Link href={`/integrations/${connection.id}`} className="flex items-center gap-3 pr-20">
        <span className="provider-mark size-10">{connection.logo}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{connection.name}</span>
          <span className="mt-1 block truncate text-xs text-[var(--muted)]">
            {connection.accountName ?? connection.provider}
          </span>
        </span>
        <ArrowRight size={15} className="text-[var(--muted)]" />
      </Link>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${healthy ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}
        >
          {healthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {connection.status} · {connection.freshness}
        </span>
        <button
          type="button"
          onClick={() => void deleteConnection()}
          disabled={deleting}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
        >
          {deleting ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Delete
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </article>
  );
}
