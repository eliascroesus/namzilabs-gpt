"use client";

import { ArrowRight, LoaderCircle, Trash2 } from "lucide-react";
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
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteMetric() {
    if (!window.confirm(`Remove “${metric.name}” from the workspace?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/metrics/${metric.id}`, { method: "DELETE" });
      const result = (await response.json()) as {
        requestId?: string;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          `${result.error?.message ?? "The metric could not be deleted."}${result.requestId ? ` Reference: ${result.requestId}` : ""}`,
        );
      setDeleted(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The metric could not be deleted.");
      setDeleting(false);
    }
  }

  if (deleted) return null;

  return (
    <article className="metric-library-card shell-card group">
      <div className="metric-library-card-topline">
        <div className="metric-library-card-meta">
          <span className="metric-category-badge">{metric.category}</span>
          <span className="metric-version-badge">
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
      <Link href={`/metrics/${metric.slug}`} className="metric-library-card-link">
        <h2>{metric.name}</h2>
        <p>{metric.description || "No description"}</p>
        <div className="metric-library-card-footer">
          <span>View definition</span>
          <ArrowRight size={15} />
        </div>
      </Link>
      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </article>
  );
}
