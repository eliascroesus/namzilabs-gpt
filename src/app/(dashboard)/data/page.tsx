import { DataExplorer } from "@/components/data-explorer";

export const metadata = { title: "Data explorer" };
export const dynamic = "force-dynamic";
export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ resourceType?: string }>;
}) {
  const resourceType = (await searchParams).resourceType?.slice(0, 500);
  return <DataExplorer resourceType={resourceType} />;
}
