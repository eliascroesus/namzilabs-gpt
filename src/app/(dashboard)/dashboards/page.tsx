import { AnalyticsOverview } from "@/components/analytics-overview";
import type { DatePreset } from "@/server/metrics/time";

export const metadata = { title: "Executive dashboard" };
export const dynamic = "force-dynamic";
const supportedRanges = new Set<DatePreset>(["today", "yesterday", "last_7_days", "last_30_days"]);

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const requested = (await searchParams).range as DatePreset | undefined;
  const range = requested && supportedRanges.has(requested) ? requested : undefined;
  return <AnalyticsOverview title="Executive dashboard" range={range} />;
}
