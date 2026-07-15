"use client";

import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { MetricCard } from "@/components/metric-card";

export type MetricLibraryItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  currentPublishedVersion: number | null;
};

export function MetricLibrary({ metrics }: { metrics: MetricLibraryItem[] }) {
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set(metrics.map((metric) => metric.category))].sort((a, b) => a.localeCompare(b)),
    [metrics],
  );
  const visible = useMemo(
    () =>
      metrics
        .filter((metric) => category === "all" || metric.category === category)
        .sort((left, right) =>
          left.category === right.category
            ? left.name.localeCompare(right.name)
            : left.category.localeCompare(right.category),
        ),
    [category, metrics],
  );

  return (
    <section className="metric-library-section">
      <div className="metric-library-toolbar">
        <p>
          {visible.length} {visible.length === 1 ? "metric" : "metrics"}
        </p>
        <label>
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visible.length ? (
        <div className="metric-library-grid">
          {visible.map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      ) : (
        <div className="metric-library-empty shell-card">
          No metrics are filed under this category.
        </div>
      )}
    </section>
  );
}
