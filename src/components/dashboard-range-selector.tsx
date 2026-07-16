"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import type { DatePreset } from "@/server/metrics/time";

const ranges: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "all_time", label: "All time" },
];

export function DashboardRangeSelector({ range }: { range: DatePreset }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="dashboard-range-selector" aria-label="Reporting period">
      {ranges.map((item) => (
        <button
          key={item.value}
          type="button"
          className={range === item.value ? "active" : ""}
          aria-pressed={range === item.value}
          disabled={pending}
          onClick={() => {
            if (item.value === range) return;
            startTransition(() => router.push(`${pathname}?range=${item.value}`));
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
