import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import { getSqlClient, type Database } from "@/db/client";
import { auditLogs, connections, metrics, metricVersions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/server/auth/authorization";
import { compileMetric, describeMetric, type QueryWindow } from "@/server/metrics/compiler";
import { type MetricDefinition, parseMetricDefinition } from "@/server/metrics/dsl";
import { previousWindow } from "@/server/metrics/time";
import { safeDivide } from "@/server/metrics/evaluator";

function definitionHash(definition: MetricDefinition): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "metric";
}

export async function createMetric(
  db: Database,
  input: { tenant: TenantContext; name: string; description?: string; definition: unknown },
) {
  const definition = parseMetricDefinition(input.definition);
  const description = describeMetric(definition);
  return db.transaction(async (tx) => {
    const suffix = Date.now().toString(36).slice(-5);
    const [metric] = await tx
      .insert(metrics)
      .values({
        organizationId: input.tenant.organizationId,
        name: input.name.trim(),
        slug: `${slugify(input.name)}-${suffix}`,
        description: input.description?.trim() ?? "",
        currentPublishedVersion: 1,
        createdByUserId: input.tenant.userId,
      })
      .returning();
    if (!metric) throw new Error("Metric insert failed");
    const [version] = await tx
      .insert(metricVersions)
      .values({
        organizationId: input.tenant.organizationId,
        metricId: metric.id,
        version: 1,
        status: "published",
        definition,
        definitionHash: definitionHash(definition),
        plainLanguage: description.plainLanguage,
        formula: description.formula,
        createdByUserId: input.tenant.userId,
        publishedAt: new Date(),
      })
      .returning();
    if (!version) throw new Error("Metric version insert failed");
    await tx.insert(auditLogs).values({
      organizationId: input.tenant.organizationId,
      actorUserId: input.tenant.userId,
      action: "metric.published",
      resourceType: "metric",
      resourceId: metric.id,
      safeMetadata: { version: 1, definitionHash: version.definitionHash },
    });
    return { metric, version };
  });
}

export async function createMetricDraft(
  db: Database,
  input: { tenant: TenantContext; metricId: string; definition: unknown },
) {
  const definition = parseMetricDefinition(input.definition);
  const [metric] = await db
    .select()
    .from(metrics)
    .where(
      and(eq(metrics.organizationId, input.tenant.organizationId), eq(metrics.id, input.metricId)),
    )
    .limit(1);
  if (!metric) throw new AppError("metric_not_found", "Metric not found.", 404);
  const [latest] = await db
    .select({ version: metricVersions.version })
    .from(metricVersions)
    .where(
      and(
        eq(metricVersions.organizationId, input.tenant.organizationId),
        eq(metricVersions.metricId, metric.id),
      ),
    )
    .orderBy(desc(metricVersions.version))
    .limit(1);
  const versionNumber = (latest?.version ?? 0) + 1;
  const description = describeMetric(definition);
  const [version] = await db
    .insert(metricVersions)
    .values({
      organizationId: input.tenant.organizationId,
      metricId: metric.id,
      version: versionNumber,
      status: "draft",
      definition,
      definitionHash: definitionHash(definition),
      plainLanguage: description.plainLanguage,
      formula: description.formula,
      createdByUserId: input.tenant.userId,
    })
    .returning();
  return version;
}

export async function publishMetricVersion(
  db: Database,
  input: { tenant: TenantContext; metricId: string; version: number },
) {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(metricVersions)
      .where(
        and(
          eq(metricVersions.organizationId, input.tenant.organizationId),
          eq(metricVersions.metricId, input.metricId),
          eq(metricVersions.version, input.version),
        ),
      )
      .limit(1);
    if (!version) throw new AppError("metric_version_not_found", "Metric version not found.", 404);
    await tx
      .update(metricVersions)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(metricVersions.id, version.id));
    await tx
      .update(metrics)
      .set({ currentPublishedVersion: input.version, updatedAt: new Date() })
      .where(
        and(
          eq(metrics.organizationId, input.tenant.organizationId),
          eq(metrics.id, input.metricId),
        ),
      );
    await tx.insert(auditLogs).values({
      organizationId: input.tenant.organizationId,
      actorUserId: input.tenant.userId,
      action: "metric.published",
      resourceType: "metric",
      resourceId: input.metricId,
      safeMetadata: { version: input.version, definitionHash: version.definitionHash },
    });
    return { ...version, status: "published" as const };
  });
}

export async function executeDefinition(
  definitionInput: unknown,
  organizationId: string,
  window: QueryWindow,
): Promise<{ rows: Record<string, unknown>[]; durationMs: number; matchingCount: number }> {
  const definition = parseMetricDefinition(definitionInput);
  if (definition.measure.operation === "ratio") {
    throw new AppError(
      "ratio_preview_requires_saved_metrics",
      "Save both component metrics before previewing a ratio.",
      400,
    );
  }
  const compiled = compileMetric(definition, organizationId, window);
  const startedAt = performance.now();
  const result = await getSqlClient().unsafe(compiled.text, compiled.parameters as never[]);
  const durationMs = performance.now() - startedAt;
  const rows = Array.from(result) as Record<string, unknown>[];
  const matching = await getSqlClient().unsafe(
    `SELECT COUNT(*)::bigint AS "value" FROM (${compiled.matchingRecordsText.replace(/ LIMIT \$\d+ OFFSET \$\d+$/, "")}) AS matching_records`,
    compiled.matchingRecordsParameters as never[],
  );
  return { rows, durationMs, matchingCount: Number(matching[0]?.value ?? 0) };
}

export async function matchingRecords(
  definitionInput: unknown,
  organizationId: string,
  window: QueryWindow,
  pagination: { limit: number; offset: number },
) {
  const definition = parseMetricDefinition(definitionInput);
  const compiled = compileMetric(definition, organizationId, window);
  const limit = Math.min(200, Math.max(1, pagination.limit));
  const offset = Math.max(0, pagination.offset);
  return getSqlClient().unsafe(compiled.matchingRecordsText, [
    ...compiled.matchingRecordsParameters,
    limit,
    offset,
  ] as never[]);
}

export async function sourceFreshness(db: Database, organizationId: string) {
  const rows = await db
    .select({
      id: connections.id,
      name: connections.name,
      provider: connections.provider,
      freshness: connections.freshness,
      lastEventAt: connections.lastEventAt,
      lastReconciledAt: connections.lastReconciledAt,
    })
    .from(connections)
    .where(eq(connections.organizationId, organizationId));
  return rows;
}

function scalar(rows: Record<string, unknown>[]): number | null {
  const value = rows[0]?.value;
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function executeSavedVersionInternal(
  db: Database,
  organizationId: string,
  versionId: string,
  window: QueryWindow,
  visited: Set<string>,
): Promise<{
  value: number | null;
  rows: Record<string, unknown>[];
  durationMs: number;
  matchingCount: number;
}> {
  if (visited.has(versionId) || visited.size >= 10) {
    throw new AppError(
      "metric_dependency_cycle",
      "Metric ratios cannot contain a dependency cycle.",
      400,
    );
  }
  visited.add(versionId);
  const [version] = await db
    .select()
    .from(metricVersions)
    .where(and(eq(metricVersions.organizationId, organizationId), eq(metricVersions.id, versionId)))
    .limit(1);
  if (!version || version.status !== "published")
    throw new AppError("metric_version_not_found", "Published metric version not found.", 404);
  const definition = parseMetricDefinition(version.definition);
  if (definition.measure.operation !== "ratio") {
    const result = await executeDefinition(definition, organizationId, window);
    visited.delete(versionId);
    return { ...result, value: scalar(result.rows) };
  }
  const numerator = await executeSavedVersionInternal(
    db,
    organizationId,
    definition.measure.numeratorMetricVersionId,
    window,
    visited,
  );
  const denominator = await executeSavedVersionInternal(
    db,
    organizationId,
    definition.measure.denominatorMetricVersionId,
    window,
    visited,
  );
  visited.delete(versionId);
  const value =
    numerator.value === null || denominator.value === null
      ? null
      : safeDivide(numerator.value, denominator.value);
  return {
    value,
    rows: [{ value }],
    durationMs: numerator.durationMs + denominator.durationMs,
    matchingCount: numerator.matchingCount,
  };
}

export async function executeSavedMetricVersion(
  db: Database,
  organizationId: string,
  versionId: string,
  window: QueryWindow,
) {
  const current = await executeSavedVersionInternal(
    db,
    organizationId,
    versionId,
    window,
    new Set(),
  );
  const [version] = await db
    .select({ definition: metricVersions.definition })
    .from(metricVersions)
    .where(and(eq(metricVersions.organizationId, organizationId), eq(metricVersions.id, versionId)))
    .limit(1);
  const definition = parseMetricDefinition(version?.definition);
  if (definition.comparison !== "previous_period")
    return { current, previous: null, changePercent: null };
  const priorWindow = previousWindow(window);
  const previous = await executeSavedVersionInternal(
    db,
    organizationId,
    versionId,
    { ...priorWindow, timezone: window.timezone },
    new Set(),
  );
  const ratio =
    current.value === null || previous.value === null
      ? null
      : safeDivide(current.value - previous.value, Math.abs(previous.value));
  return { current, previous, changePercent: ratio === null ? null : ratio * 100 };
}
