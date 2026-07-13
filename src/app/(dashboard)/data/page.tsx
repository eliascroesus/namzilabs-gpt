import { DataExplorer } from "@/components/data-explorer";

export const metadata = { title: "Data explorer" };
export const dynamic = "force-dynamic";
export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ activityType?: string }>;
}) {
  const activityType = (await searchParams).activityType?.slice(0, 100);
  return <DataExplorer activityType={activityType} />;
}
