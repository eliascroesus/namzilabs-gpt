import { AnalyticsOverview } from "@/components/analytics-overview";

export const metadata = { title: "Executive dashboard" };
export const dynamic = "force-dynamic";
export default async function DashboardsPage() {
  return <AnalyticsOverview title="Executive dashboard" />;
}
