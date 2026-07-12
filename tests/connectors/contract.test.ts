import { describe, expect, it } from "vitest";

import { connectors } from "@/connectors/registry";

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
});
