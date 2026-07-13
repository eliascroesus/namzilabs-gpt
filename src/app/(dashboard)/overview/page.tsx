import { AnalyticsOverview } from "@/components/analytics-overview";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";
export default async function OverviewPage() {
  return <AnalyticsOverview />;
}
