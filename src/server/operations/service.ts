import { and, asc, count, eq, gte, isNull, min } from "drizzle-orm";

import type { Database } from "@/db/client";
import { connections, operationalMeasurements, outboxEvents, rawEvents } from "@/db/schema";

export const serviceObjectives = {
  webhook_acceptance_ms: { percentile: 0.95, comparison: "lte", target: 1_000, unit: "ms" },
  webhook_to_dashboard_ms: {
    percentile: 0.95,
    comparison: "lte",
    target: 60_000,
    unit: "ms",
  },
  dashboard_query_ms: { percentile: 0.95, comparison: "lte", target: 1_500, unit: "ms" },
} as const;

export type ObjectiveName = keyof typeof serviceObjectives;

export type Measurement = {
  organizationId: string;
  connectionId?: string;
  name:
    | ObjectiveName
    | "reconciliation_repair_count"
    | "oauth_refresh_failure"
    | "provider_api_request";
  value: number;
  unit: "ms" | "count";
  outcome?: "success" | "failure";
  safeDimensions?: Record<string, string | number | boolean | null>;
};

export async function recordMeasurement(db: Database, input: Measurement): Promise<void> {
  if (!Number.isFinite(input.value) || input.value < 0) return;
  await db.insert(operationalMeasurements).values({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    name: input.name,
    value: String(input.value),
    unit: input.unit,
    outcome: input.outcome ?? "success",
    safeDimensions: input.safeDimensions ?? {},
  });
}

export async function recordMeasurementSafely(db: Database, input: Measurement): Promise<void> {
  try {
    await recordMeasurement(db, input);
  } catch {
    // Telemetry must never make an accepted webhook or completed query fail.
    console.warn(JSON.stringify({ event: "operational_measurement_failed", name: input.name }));
  }
}

export function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}

export function summarizeObjectives(
  rows: { name: string; value: string | number }[],
): Record<
  ObjectiveName,
  { samples: number; p95: number | null; target: number; passing: boolean | null }
> {
  return Object.fromEntries(
    Object.entries(serviceObjectives).map(([name, objective]) => {
      const values = rows
        .filter((row) => row.name === name)
        .map((row) => Number(row.value))
        .filter(Number.isFinite);
      const p95 = percentile(values, objective.percentile);
      return [
        name,
        {
          samples: values.length,
          p95,
          target: objective.target,
          passing: p95 === null ? null : p95 <= objective.target,
        },
      ];
    }),
  ) as Record<
    ObjectiveName,
    { samples: number; p95: number | null; target: number; passing: boolean | null }
  >;
}

export async function operationsSnapshot(db: Database, organizationId: string, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const [measurements, eventCounts, pendingRows, outboxRows, connectionRows] = await Promise.all([
    db
      .select({
        name: operationalMeasurements.name,
        value: operationalMeasurements.value,
        outcome: operationalMeasurements.outcome,
      })
      .from(operationalMeasurements)
      .where(
        and(
          eq(operationalMeasurements.organizationId, organizationId),
          gte(operationalMeasurements.recordedAt, since),
        ),
      )
      .limit(50_000),
    db
      .select({ status: rawEvents.status, value: count() })
      .from(rawEvents)
      .where(and(eq(rawEvents.organizationId, organizationId), gte(rawEvents.receivedAt, since)))
      .groupBy(rawEvents.status),
    db
      .select({ value: count(), oldest: min(rawEvents.receivedAt) })
      .from(rawEvents)
      .where(and(eq(rawEvents.organizationId, organizationId), eq(rawEvents.status, "pending"))),
    db
      .select({ value: count(), oldest: min(outboxEvents.createdAt) })
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.organizationId, organizationId), isNull(outboxEvents.publishedAt)),
      ),
    db
      .select({
        id: connections.id,
        name: connections.name,
        provider: connections.provider,
        status: connections.status,
        freshness: connections.freshness,
        consecutiveFailures: connections.consecutiveFailures,
        lastEventAt: connections.lastEventAt,
        lastReconciledAt: connections.lastReconciledAt,
        lastSuccessfulSyncAt: connections.lastSuccessfulSyncAt,
        lastErrorCode: connections.lastErrorCode,
      })
      .from(connections)
      .where(eq(connections.organizationId, organizationId))
      .orderBy(asc(connections.name)),
  ]);

  const statuses = Object.fromEntries(eventCounts.map((row) => [row.status, Number(row.value)]));
  const total = Object.values(statuses).reduce((sum, value) => sum + value, 0);
  const successful = (statuses.processed ?? 0) + (statuses.duplicate ?? 0);
  const terminal = successful + (statuses.quarantined ?? 0) + (statuses.dead_lettered ?? 0);
  const pending = pendingRows[0];
  const outbox = outboxRows[0];
  const providerRequests = measurements.filter((row) => row.name === "provider_api_request");
  const providerFailures = providerRequests.filter((row) => row.outcome === "failure").length;
  const reconciliationRepairs = measurements
    .filter((row) => row.name === "reconciliation_repair_count")
    .reduce((sum, row) => sum + Number(row.value), 0);
  const oauthRefreshFailures = measurements
    .filter((row) => row.name === "oauth_refresh_failure")
    .reduce((sum, row) => sum + Number(row.value), 0);

  return {
    window: { start: since.toISOString(), end: now.toISOString() },
    objectives: summarizeObjectives(measurements),
    events: {
      total,
      statuses,
      processingSuccessRate: total === 0 ? null : successful / total,
      terminalRate: total === 0 ? null : terminal / total,
      pending: Number(pending?.value ?? 0),
      oldestPendingSeconds: pending?.oldest
        ? Math.max(0, (now.getTime() - pending.oldest.getTime()) / 1_000)
        : null,
    },
    queue: {
      depth: Number(outbox?.value ?? 0),
      oldestPendingSeconds: outbox?.oldest
        ? Math.max(0, (now.getTime() - outbox.oldest.getTime()) / 1_000)
        : null,
    },
    providers: {
      requests: providerRequests.length,
      failures: providerFailures,
      errorRate: providerRequests.length === 0 ? null : providerFailures / providerRequests.length,
      oauthRefreshFailures,
      reconciliationRepairs,
    },
    connections: connectionRows.map((connection) => ({
      ...connection,
      syncLagSeconds: connection.lastSuccessfulSyncAt
        ? Math.max(0, (now.getTime() - connection.lastSuccessfulSyncAt.getTime()) / 1_000)
        : null,
    })),
  };
}
