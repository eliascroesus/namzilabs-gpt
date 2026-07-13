import { AnalyticsOverview } from "@/components/analytics-overview";
import type { DatePreset } from "@/server/metrics/time";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";
const supportedRanges = new Set<DatePreset>(["today", "yesterday", "last_7_days", "last_30_days"]);

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const requested = (await searchParams).range as DatePreset | undefined;
  const range = requested && supportedRanges.has(requested) ? requested : undefined;
  return <AnalyticsOverview range={range} />;
}
