import { z } from "zod";

export const providerIds = [
  "webhook",
  "google-sheets",
  "calendly",
  "close",
  "instantly",
  "brevo",
  "cal-com",
  "google-calendar",
  "stripe",
  "whop",
  "propal",
] as const;
export type ProviderId = (typeof providerIds)[number];

export type ConnectorAuthType = "oauth2" | "api-key" | "webhook-secret";
export type ConnectorCapability =
  "oauth" | "api-key" | "webhooks" | "polling" | "backfill" | "sample" | "subscription-renewal";

export type ConnectorManifest = {
  id: ProviderId;
  name: string;
  description: string;
  logo: string;
  authType: ConnectorAuthType;
  apiVersion: string;
  mappingVersion: number;
  resources: readonly string[];
  events: readonly string[];
  capabilities: readonly ConnectorCapability[];
};

export type ConnectorContext = {
  organizationId: string;
  connectionId: string;
  callbackUrl: string;
  credentials: Record<string, string>;
  configuration: Record<string, unknown>;
};

export type AuthorizationResult =
  | { kind: "redirect"; url: string; state: string }
  | { kind: "validated"; externalAccountId: string; externalAccountName?: string };

export type DiscoveredResource = {
  type: string;
  externalId: string;
  name: string;
  metadata?: Record<string, unknown>;
};

export type BackfillPage = {
  records: Record<string, unknown>[];
  nextCursor: string | null;
  checkpoint?: string;
  highWatermark?: string;
};

export type SubscriptionResult = {
  externalId?: string;
  resourceId?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  credentialUpdates?: Record<string, string>;
};

export type IncomingWebhook = {
  rawBody: string;
  headers: Headers;
  url?: string;
};

export type ParsedWebhookEvent = {
  providerEventId?: string;
  eventType: string;
  eventAt?: string;
  sourceTimezone?: string;
  payload: Record<string, unknown>;
};

export type NormalizedRecord = {
  resourceType: string;
  externalId: string;
  sourceVersion?: string;
  sourceUpdatedAt?: string;
  occurredAt?: string;
  isDeleted: boolean;
  data: Record<string, unknown>;
  promoted?: {
    displayName?: string;
    normalizedEmail?: string;
    normalizedPhone?: string;
    status?: string;
    ownerExternalId?: string;
    campaignExternalId?: string;
    amount?: string;
    currency?: string;
  };
  activity?: {
    type: string;
    externalId: string;
    occurredAt: string;
    dimensions: Record<string, unknown>;
    measures?: Record<string, number>;
    promoted?: {
      status?: string;
      channel?: string;
      ownerId?: string;
      amount?: string;
      durationSeconds?: number;
    };
  };
};

export type ConnectorHealth = {
  ok: boolean;
  checkedAt: string;
  message: string;
  freshness: "live" | "delayed" | "unavailable";
};

export interface Connector {
  readonly manifest: ConnectorManifest;
  authorize(context: ConnectorContext): Promise<AuthorizationResult>;
  validateCredentials(context: ConnectorContext): Promise<AuthorizationResult>;
  discoverResources(context: ConnectorContext): Promise<DiscoveredResource[]>;
  fetchSample(context: ConnectorContext, limit: 3): Promise<Record<string, unknown>[]>;
  startBackfill(context: ConnectorContext, cursor?: string): Promise<BackfillPage>;
  continueBackfill(context: ConnectorContext, cursor: string): Promise<BackfillPage>;
  createSubscription(context: ConnectorContext): Promise<SubscriptionResult>;
  renewSubscription(
    context: ConnectorContext,
    subscription: SubscriptionResult,
  ): Promise<SubscriptionResult>;
  deleteSubscription(context: ConnectorContext, subscription: SubscriptionResult): Promise<void>;
  verifyWebhook(context: ConnectorContext, webhook: IncomingWebhook): Promise<boolean>;
  parseWebhook(context: ConnectorContext, webhook: IncomingWebhook): Promise<ParsedWebhookEvent[]>;
  normalizeRecord(
    context: ConnectorContext,
    record: Record<string, unknown>,
    eventType?: string,
  ): Promise<NormalizedRecord>;
  healthCheck(context: ConnectorContext): Promise<ConnectorHealth>;
  revokeCredentials(context: ConnectorContext): Promise<void>;
}

export const jsonObjectSchema = z.record(z.string(), z.unknown());
