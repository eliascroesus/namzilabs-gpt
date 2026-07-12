import { notFound } from "next/navigation";

import { ConnectionWizard } from "@/components/connection-wizard";
import { getConnector } from "@/connectors/registry";
import { providerIds, type ProviderId } from "@/connectors/types";

export default async function NewConnectionPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  if (!providerIds.includes(provider as ProviderId)) notFound();
  return <ConnectionWizard manifest={getConnector(provider as ProviderId).manifest} />;
}
