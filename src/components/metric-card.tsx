"use client";

import { ArrowRight, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MetricCard({
  metric,
}: {
  metric: {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    currentPublishedVersion: number | null;
  };
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteMetric() {
    if (!window.confirm(`Delete “${metric.name}” and all of its versions?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/metrics/${metric.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? "The metric could not be deleted.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The metric could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <article className="shell-card group relative flex min-h-56 flex-col p-5 transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="metric-category-badge">{metric.category}</span>
          <span className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]">
            {metric.currentPublishedVersion
              ? `v${metric.currentPublishedVersion} published`
              : "draft only"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void deleteMetric()}
          disabled={deleting}
          className="metric-delete-button"
          aria-label={`Delete ${metric.name}`}
        >
          {deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      </div>
      <Link href={`/metrics/${metric.slug}`} className="mt-5 flex flex-1 flex-col">
        <h2 className="font-semibold">{metric.name}</h2>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--muted)]">
          {metric.description || "No description"}
        </p>
        <div className="mt-auto flex items-center justify-between pt-5 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={13} /> Parameterized · traceable
          </span>
          <ArrowRight
            size={15}
            className="transition group-hover:translate-x-0.5 group-hover:text-[var(--foreground)]"
          />
        </div>
      </Link>
      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </article>
  );
}
