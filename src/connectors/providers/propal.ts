import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import { credential, defaultNormalizedRecord } from "@/connectors/shared";
import { jsonObjectSchema, type Connector } from "@/connectors/types";

const organizationSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    data: jsonObjectSchema.optional(),
  })
  .passthrough();
const listSchema = z
  .object({
    data: z.array(jsonObjectSchema).optional(),
    items: z.array(jsonObjectSchema).optional(),
    next_cursor: z.string().nullable().optional(),
    has_more: z.boolean().optional(),
    pagination: jsonObjectSchema.optional(),
  })
  .passthrough();

function token(context: Parameters<Connector["validateCredentials"]>[0]): string {
  return credential(context, "apiKey");
}

function records(result: z.infer<typeof listSchema>) {
  return result.data ?? result.items ?? [];
}

function nextCursor(result: z.infer<typeof listSchema>): string | null {
  const cursor =
    result.next_cursor ?? result.pagination?.next_cursor ?? result.pagination?.nextCursor;
  const hasMore = result.has_more ?? result.pagination?.has_more ?? result.pagination?.hasMore;
  return hasMore && cursor ? String(cursor) : null;
}

export const propalConnector: Connector = {
  manifest: {
    id: "propal",
    name: "Propal",
    description: "Proposal, lead, pipeline, conversion and sales data through the REST API.",
    logo: "PP",
    authType: "api-key",
    apiVersion: "v1",
    mappingVersion: 1,
    resources: ["proposal"],
    events: ["proposal.synced", "lead.synced", "proposal_view.synced"],
    capabilities: ["api-key", "polling", "backfill", "sample"],
  },

  async authorize(context) {
    return this.validateCredentials(context);
  },

  async validateCredentials(context) {
    const result = await providerFetch(
      "https://api.propal.io/v1/organization",
      { headers: bearerHeaders(token(context)) },
      organizationSchema,
    );
    const organization = result.data ?? result;
    return {
      kind: "validated",
      externalAccountId: String(organization.id ?? "propal-organization"),
      externalAccountName: String(organization.name ?? "Propal organization"),
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      "https://api.propal.io/v1/proposals?limit=100",
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return records(result).map((proposal) => ({
      type: "proposal",
      externalId: String(proposal.proposal_id ?? proposal.id ?? ""),
      name: String(
        proposal.title ?? proposal.name ?? proposal.proposal_id ?? proposal.id ?? "Proposal",
      ),
    }));
  },

  async fetchSample(context, limit) {
    const result = await providerFetch(
      `https://api.propal.io/v1/proposals?limit=${limit}`,
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return records(result).slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const url = new URL("https://api.propal.io/v1/proposals");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await providerFetch(
      url.toString(),
      { headers: bearerHeaders(token(context)) },
      listSchema,
    );
    return { records: records(result), nextCursor: nextCursor(result) };
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription() {
    // Propal's public REST v1 does not expose webhooks. The scheduled reconciliation
    // worker is the source of truth until Propal publishes a signed webhook contract.
    return { metadata: { mode: "polling", reason: "provider_has_no_public_webhooks" } };
  },

  async renewSubscription(_context, subscription) {
    return subscription;
  },

  async deleteSubscription() {},

  async verifyWebhook() {
    return false;
  },

  async parseWebhook() {
    return [];
  },

  async normalizeRecord(_context, record, eventType) {
    const client = jsonObjectSchema.safeParse(record.client ?? record.lead);
    return defaultNormalizedRecord(
      {
        ...record,
        id: record.proposal_id ?? record.id,
        created_at: record.proposal_created_at ?? record.created_at,
        name: record.title ?? record.name,
        email: client.success ? client.data.email : undefined,
        amount: record.total ?? record.value ?? record.amount,
      },
      "proposal",
      eventType,
    );
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Propal polling connected",
      freshness: "delayed",
    };
  },

  async revokeCredentials() {
    // Propal API keys are revoked in Propal; the encrypted local copy is removed by Namzi.
  },
};
