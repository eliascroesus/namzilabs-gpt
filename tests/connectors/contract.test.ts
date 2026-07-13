import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { connectors } from "@/connectors/registry";
import type { ConnectorContext } from "@/connectors/types";

const methods = [
  "authorize",
  "validateCredentials",
  "discoverResources",
  "fetchSample",
  "startBackfill",
  "continueBackfill",
  "createSubscription",
  "renewSubscription",
  "deleteSubscription",
  "verifyWebhook",
  "parseWebhook",
  "normalizeRecord",
  "healthCheck",
  "revokeCredentials",
] as const;

describe("connector contract", () => {
  it("registers all Phase 1 connectors exactly once", () => {
    expect(connectors.map((connector) => connector.manifest.id)).toEqual([
      "webhook",
      "google-sheets",
      "calendly",
      "close",
      "instantly",
      "brevo",
    ]);
    expect(new Set(connectors.map((connector) => connector.manifest.id)).size).toBe(
      connectors.length,
    );
  });

  it.each(connectors.map((connector) => [connector.manifest.id, connector] as const))(
    "%s exposes the complete behavior contract",
    (_id, connector) => {
      for (const method of methods) expect(connector[method]).toBeTypeOf("function");
      expect(connector.manifest.apiVersion).not.toBe("");
      expect(connector.manifest.mappingVersion).toBeGreaterThan(0);
      expect(connector.manifest.resources.length).toBeGreaterThan(0);
      expect(connector.manifest.capabilities.length).toBeGreaterThan(0);
    },
  );

  it("does not claim deprecated Instantly v1 support", () => {
    const instantly = connectors.find((connector) => connector.manifest.id === "instantly");
    expect(instantly?.manifest.apiVersion).toBe("v2");
  });

  it.each(connectors.map((connector) => [connector.manifest.id, connector] as const))(
    "%s normalizes its sanitized contract fixture without live customer data",
    async (id, connector) => {
      const raw = readFileSync(`tests/fixtures/providers/${id}.json`, "utf8");
      expect(raw).not.toMatch(/authorization|refresh_token|api[_-]?key/i);
      const record = JSON.parse(raw) as Record<string, unknown>;
      const context: ConnectorContext = {
        organizationId: "00000000-0000-4000-8000-000000000001",
        connectionId: "00000000-0000-4000-8000-000000000002",
        callbackUrl: "https://example.test/webhook",
        credentials: {},
        configuration:
          id === "google-sheets" ? { uniqueKeyColumn: "Lead ID", syncMode: "upsert" } : {},
      };
      const normalized = await connector.normalizeRecord(context, record, "fixture.changed");
      expect(normalized.externalId).not.toBe("");
      expect(normalized.data).toEqual(record);
    },
  );
});
