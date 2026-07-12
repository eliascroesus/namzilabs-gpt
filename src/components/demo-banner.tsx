import { FlaskConical } from "lucide-react";

import { demoModeLabel } from "@/lib/demo-data";

export function DemoBanner() {
  return (
    <div
      className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
      role="status"
    >
      <FlaskConical size={14} aria-hidden="true" />
      {demoModeLabel}
    </div>
  );
}
