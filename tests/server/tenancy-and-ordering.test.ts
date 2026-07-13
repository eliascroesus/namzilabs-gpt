import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assertOrganization, type TenantContext } from "@/server/auth/authorization";
import { isIncomingStale } from "@/server/ingestion/service";

describe("tenant isolation and event ordering", () => {
  it("fails closed when a resource belongs to another tenant", () => {
    const context: TenantContext = { organizationId: "org-a", userId: "user-a", role: "owner" };
    expect(() => assertOrganization(context, "org-b")).toThrow("not found");
  });

  it("prevents an older provider update from replacing a newer record", () => {
    expect(
      isIncomingStale(new Date("2026-07-11T12:05:00Z"), new Date("2026-07-11T12:00:00Z")),
    ).toBe(true);
    expect(
      isIncomingStale(new Date("2026-07-11T12:00:00Z"), new Date("2026-07-11T12:05:00Z")),
    ).toBe(false);
  });

  it("has RLS policies for every tenant-owned table", () => {
    const migration = readdirSync("drizzle")
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(`drizzle/${file}`, "utf8"))
      .join("\n");
    for (const table of [
      "connections",
      "encrypted_credentials",
      "connection_resources",
      "webhook_subscriptions",
      "sync_cursors",
      "sync_runs",
      "raw_events",
      "outbox_events",
      "source_records",
      "field_catalog",
      "canonical_entities",
      "entity_identifiers",
      "activity_facts",
      "dead_letter_events",
      "audit_logs",
      "identity_review_queue",
      "identity_rules",
      "metrics",
      "metric_versions",
      "dashboards",
      "dashboard_cards",
      "goals",
      "export_jobs",
      "operational_measurements",
    ]) {
      expect(migration).toContain(`CREATE POLICY "${table}_tenant_policy"`);
    }
    expect(migration).toContain("raw event content is immutable");
  });
});
