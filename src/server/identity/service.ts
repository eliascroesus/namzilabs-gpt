import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  activityFacts,
  auditLogs,
  canonicalEntities,
  entityIdentifiers,
  identityReviewQueue,
  sourceRecords,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/server/auth/authorization";

export type IdentitySignal = {
  type: "email" | "phone" | "provider_external_id" | "customer_id" | "domain_rule";
  value: string;
  provider?: string;
};

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export function normalizePhone(value: string): string | null {
  const cleaned = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) return null;
  return cleaned;
}

export function normalizeIdentitySignal(
  signal: IdentitySignal,
): { type: string; value: string } | null {
  if (signal.type === "email") {
    const value = normalizeEmail(signal.value);
    return value ? { type: "email", value } : null;
  }
  if (signal.type === "phone") {
    const value = normalizePhone(signal.value);
    return value ? { type: "phone", value } : null;
  }
  const value = signal.value.trim().normalize("NFKC");
  if (!value) return null;
  if (signal.type === "provider_external_id") {
    if (!signal.provider) return null;
    return { type: "provider_external_id", value: `${signal.provider}:${value}` };
  }
  return { type: signal.type, value };
}

export function chooseIdentityMatch(
  matches: Array<{ entityId: string; locked: boolean }>,
):
  | { kind: "none" }
  | { kind: "matched"; entityId: string }
  | { kind: "ambiguous"; entityIds: string[] } {
  const entityIds = [...new Set(matches.map((match) => match.entityId))];
  if (entityIds.length === 0) return { kind: "none" };
  if (entityIds.length === 1) return { kind: "matched", entityId: entityIds[0]! };
  return { kind: "ambiguous", entityIds };
}

export async function resolveIdentity(
  db: Database,
  input: {
    tenant: TenantContext;
    sourceRecordId: string;
    entityType: string;
    displayName?: string;
    signals: IdentitySignal[];
  },
): Promise<{ kind: "created" | "matched" | "review"; entityId?: string; reviewIds?: string[] }> {
  const normalized = input.signals.map(normalizeIdentitySignal).filter((signal) => signal !== null);
  const candidateRows = [];
  for (const signal of normalized) {
    const rows = await db
      .select({ entityId: entityIdentifiers.entityId, locked: entityIdentifiers.locked })
      .from(entityIdentifiers)
      .where(
        and(
          eq(entityIdentifiers.organizationId, input.tenant.organizationId),
          eq(entityIdentifiers.identifierType, signal.type),
          eq(entityIdentifiers.normalizedValue, signal.value),
        ),
      );
    candidateRows.push(...rows);
  }
  const decision = chooseIdentityMatch(candidateRows);
  if (decision.kind === "ambiguous") {
    const reviewIds: string[] = [];
    for (const entityId of decision.entityIds) {
      const signal = normalized[0];
      if (!signal) continue;
      const [review] = await db
        .insert(identityReviewQueue)
        .values({
          organizationId: input.tenant.organizationId,
          sourceRecordId: input.sourceRecordId,
          proposedEntityId: entityId,
          identifierType: signal.type,
          normalizedValue: signal.value,
          reason: "Different exact identifiers point to different canonical entities.",
        })
        .onConflictDoNothing()
        .returning({ id: identityReviewQueue.id });
      if (review) reviewIds.push(review.id);
    }
    return { kind: "review", reviewIds };
  }
  if (decision.kind === "matched") {
    await db.transaction(async (tx) => {
      if (normalized.length) {
        await tx
          .insert(entityIdentifiers)
          .values(
            normalized.map((signal) => ({
              organizationId: input.tenant.organizationId,
              entityId: decision.entityId,
              identifierType: signal.type,
              normalizedValue: signal.value,
              source: "deterministic",
            })),
          )
          .onConflictDoNothing();
      }
      await tx
        .update(activityFacts)
        .set({ entityId: decision.entityId, updatedAt: new Date() })
        .where(
          and(
            eq(activityFacts.organizationId, input.tenant.organizationId),
            eq(activityFacts.sourceRecordId, input.sourceRecordId),
          ),
        );
      await tx.insert(auditLogs).values({
        organizationId: input.tenant.organizationId,
        actorUserId: input.tenant.userId,
        action: "identity.matched",
        resourceType: "canonical_entity",
        resourceId: decision.entityId,
        safeMetadata: { sourceRecordId: input.sourceRecordId },
      });
    });
    return { kind: "matched", entityId: decision.entityId };
  }

  return db.transaction(async (tx) => {
    const [entity] = await tx
      .insert(canonicalEntities)
      .values({
        organizationId: input.tenant.organizationId,
        entityType: input.entityType,
        displayName: input.displayName,
        normalizedEmail: normalized.find((signal) => signal.type === "email")?.value,
        normalizedPhone: normalized.find((signal) => signal.type === "phone")?.value,
      })
      .returning({ id: canonicalEntities.id });
    if (!entity) throw new Error("Canonical entity insert failed");
    if (normalized.length) {
      await tx.insert(entityIdentifiers).values(
        normalized.map((signal) => ({
          organizationId: input.tenant.organizationId,
          entityId: entity.id,
          identifierType: signal.type,
          normalizedValue: signal.value,
          source: "deterministic",
        })),
      );
    }
    await tx.insert(auditLogs).values({
      organizationId: input.tenant.organizationId,
      actorUserId: input.tenant.userId,
      action: "identity.created",
      resourceType: "canonical_entity",
      resourceId: entity.id,
      safeMetadata: {
        entityType: input.entityType,
        identifierTypes: normalized.map((signal) => signal.type),
      },
    });
    return { kind: "created" as const, entityId: entity.id };
  });
}

export async function resolveIdentityReview(
  db: Database,
  input: {
    tenant: TenantContext;
    reviewId: string;
    decision: "merged" | "split" | "dismissed";
    note?: string;
  },
): Promise<void> {
  if (!(["owner", "admin"] as const).includes(input.tenant.role as "owner" | "admin")) {
    throw new AppError("forbidden", "Only administrators can resolve identity reviews.", 403);
  }
  const [review] = await db
    .select()
    .from(identityReviewQueue)
    .where(
      and(
        eq(identityReviewQueue.organizationId, input.tenant.organizationId),
        eq(identityReviewQueue.id, input.reviewId),
        eq(identityReviewQueue.status, "pending"),
      ),
    )
    .limit(1);
  if (!review) throw new AppError("identity_review_not_found", "Identity review not found.", 404);
  await db.transaction(async (tx) => {
    let resolvedEntityId = review.proposedEntityId;
    if (input.decision === "split") {
      const [record] = await tx
        .select({
          displayName: sourceRecords.displayName,
          normalizedEmail: sourceRecords.normalizedEmail,
          normalizedPhone: sourceRecords.normalizedPhone,
        })
        .from(sourceRecords)
        .where(
          and(
            eq(sourceRecords.organizationId, input.tenant.organizationId),
            eq(sourceRecords.id, review.sourceRecordId),
          ),
        )
        .limit(1);
      const [entity] = await tx
        .insert(canonicalEntities)
        .values({
          organizationId: input.tenant.organizationId,
          entityType: "person",
          displayName: record?.displayName,
          normalizedEmail: record?.normalizedEmail,
          normalizedPhone: record?.normalizedPhone,
          locked: true,
        })
        .returning({ id: canonicalEntities.id });
      if (!entity) throw new Error("Split entity insert failed");
      resolvedEntityId = entity.id;
    }
    if (input.decision === "merged" || input.decision === "split") {
      await tx
        .update(activityFacts)
        .set({ entityId: resolvedEntityId, updatedAt: new Date() })
        .where(
          and(
            eq(activityFacts.organizationId, input.tenant.organizationId),
            eq(activityFacts.sourceRecordId, review.sourceRecordId),
          ),
        );
    }
    await tx
      .update(identityReviewQueue)
      .set({
        status: input.decision,
        resolutionNote: input.note,
        resolvedByUserId: input.tenant.userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(identityReviewQueue.id, review.id));
    await tx.insert(auditLogs).values({
      organizationId: input.tenant.organizationId,
      actorUserId: input.tenant.userId,
      action: `identity.${input.decision}`,
      resourceType: "identity_review",
      resourceId: review.id,
      safeMetadata: {
        proposedEntityId: review.proposedEntityId,
        resolvedEntityId,
        note: input.note?.slice(0, 200),
      },
    });
  });
}

export async function setIdentityLock(
  db: Database,
  input: { tenant: TenantContext; entityId: string; locked: boolean },
): Promise<void> {
  const [entity] = await db
    .update(canonicalEntities)
    .set({ locked: input.locked, updatedAt: new Date() })
    .where(
      and(
        eq(canonicalEntities.organizationId, input.tenant.organizationId),
        eq(canonicalEntities.id, input.entityId),
      ),
    )
    .returning({ id: canonicalEntities.id });
  if (!entity) throw new AppError("canonical_entity_not_found", "Canonical entity not found.", 404);
  await db
    .update(entityIdentifiers)
    .set({ locked: input.locked, updatedAt: new Date() })
    .where(
      and(
        eq(entityIdentifiers.organizationId, input.tenant.organizationId),
        eq(entityIdentifiers.entityId, input.entityId),
      ),
    );
  await db.insert(auditLogs).values({
    organizationId: input.tenant.organizationId,
    actorUserId: input.tenant.userId,
    action: input.locked ? "identity.locked" : "identity.unlocked",
    resourceType: "canonical_entity",
    resourceId: input.entityId,
  });
}
