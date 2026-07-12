import type { Connector, ProviderId } from "@/connectors/types";
import { brevoConnector } from "@/connectors/providers/brevo";
import { calendlyConnector } from "@/connectors/providers/calendly";
import { closeConnector } from "@/connectors/providers/close";
import { googleSheetsConnector } from "@/connectors/providers/google-sheets";
import { instantlyConnector } from "@/connectors/providers/instantly";
import { webhookConnector } from "@/connectors/providers/webhook";
import { AppError } from "@/lib/errors";

export const connectors: readonly Connector[] = [
  webhookConnector,
  googleSheetsConnector,
  calendlyConnector,
  closeConnector,
  instantlyConnector,
  brevoConnector,
];

const registry = new Map(connectors.map((connector) => [connector.manifest.id, connector]));

export function getConnector(provider: ProviderId): Connector {
  const connector = registry.get(provider);
  if (!connector) throw new AppError("connector_not_found", "Connector not found.", 404);
  return connector;
}
