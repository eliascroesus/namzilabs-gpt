import { Suspense } from "react";
import { DataExplorer } from "@/components/data-explorer";

export const metadata = { title: "Data explorer" };
export default function DataPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Loading records…</div>}>
      <DataExplorer />
    </Suspense>
  );
}
