import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const connectionStatusEnum = pgEnum("connection_status", [
  "draft",
  "active",
  "delayed",
  "error",
  "paused",
  "revoked",
]);
export const eventStatusEnum = pgEnum("event_status", [
  "pending",
  "processed",
  "duplicate",
  "quarantined",
  "dead_lettered",
]);
export const syncStatusEnum = pgEnum("sync_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export const reviewStatusEnum = pgEnum("identity_review_status", [
  "pending",
  "merged",
  "split",
  "dismissed",
]);
export const metricVersionStatusEnum = pgEnum("metric_version_status", [
  "draft",
  "published",
  "archived",
]);
export const dashboardCardTypeEnum = pgEnum("dashboard_card_type", [
  "kpi",
  "time_series",
  "funnel",
  "breakdown",
  "goal",
]);
export const exportStatusEnum = pgEnum("export_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "expired",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  ...timestamps,
});

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    externalAccountId: text("external_account_id"),
    externalAccountName: text("external_account_name"),
    status: connectionStatusEnum("status").notNull().default("draft"),
    apiVersion: text("api_version").notNull(),
    mappingVersion: integer("mapping_version").notNull().default(1),
    freshness: text("freshness").notNull().default("unknown"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("connections_org_idx").on(table.organizationId),
    index("connections_org_provider_idx").on(table.organizationId, table.provider),
  ],
);

export const encryptedCredentials = pgTable(
  "encrypted_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    credentialType: text("credential_type").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    algorithm: text("algorithm").notNull().default("aes-256-gcm"),
    keyVersion: integer("key_version").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("encrypted_credentials_connection_type_uidx").on(
      table.organizationId,
      table.connectionId,
      table.credentialType,
    ),
  ],
);

export const connectionResources = pgTable(
  "connection_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connection_resources_external_uidx").on(
      table.organizationId,
      table.connectionId,
      table.resourceType,
      table.externalId,
    ),
  ],
);

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    resourceId: text("resource_id"),
    callbackTokenHash: text("callback_token_hash"),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("webhook_subscriptions_org_connection_idx").on(table.organizationId, table.connectionId),
  ],
);

export const syncCursors = pgTable(
  "sync_cursors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    cursor: text("cursor"),
    highWatermark: timestamp("high_watermark", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sync_cursors_resource_uidx").on(
      table.organizationId,
      table.connectionId,
      table.resourceType,
    ),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: syncStatusEnum("status").notNull().default("queued"),
    cursorStart: text("cursor_start"),
    cursorEnd: text("cursor_end"),
    recordsSeen: integer("records_seen").notNull().default(0),
    recordsWritten: integer("records_written").notNull().default(0),
    recordsDeleted: integer("records_deleted").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [index("sync_runs_org_connection_idx").on(table.organizationId, table.connectionId)],
);

export const rawEvents = pgTable(
  "raw_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id"),
    deduplicationKey: text("deduplication_key").notNull(),
    eventType: text("event_type").notNull(),
    rawBody: text("raw_body").notNull(),
    safeHeaders: jsonb("safe_headers").$type<Record<string, string>>().notNull().default({}),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    sourceTimezone: text("source_timezone"),
    status: eventStatusEnum("status").notNull().default("pending"),
    processingAttempts: integer("processing_attempts").notNull().default(0),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
  },
  (table) => [
    uniqueIndex("raw_events_dedup_uidx").on(
      table.organizationId,
      table.connectionId,
      table.deduplicationKey,
    ),
    index("raw_events_org_received_idx").on(table.organizationId, table.receivedAt),
    index("raw_events_pending_idx").on(table.status, table.receivedAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("outbox_unpublished_idx").on(table.publishedAt, table.availableAt)],
);

export const sourceRecords = pgTable(
  "source_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    externalId: text("external_id").notNull(),
    sourceVersion: text("source_version"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    displayName: text("display_name"),
    normalizedEmail: text("normalized_email"),
    normalizedPhone: text("normalized_phone"),
    status: text("record_status"),
    ownerExternalId: text("owner_external_id"),
    campaignExternalId: text("campaign_external_id"),
    amount: numeric("amount", { precision: 20, scale: 4 }),
    currency: text("currency"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    mappingVersion: integer("mapping_version").notNull(),
    rawEventId: uuid("raw_event_id").references(() => rawEvents.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("source_records_external_uidx").on(
      table.organizationId,
      table.connectionId,
      table.resourceType,
      table.externalId,
    ),
    index("source_records_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("source_records_org_email_idx").on(table.organizationId, table.normalizedEmail),
    index("source_records_org_phone_idx").on(table.organizationId, table.normalizedPhone),
  ],
);

export const fieldCatalog = pgTable(
  "field_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    fieldPath: text("field_path").notNull(),
    inferredType: text("inferred_type").notNull(),
    displayName: text("display_name").notNull(),
    nullable: boolean("nullable").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("field_catalog_path_uidx").on(
      table.organizationId,
      table.connectionId,
      table.resourceType,
      table.fieldPath,
    ),
  ],
);

export const canonicalEntities = pgTable(
  "canonical_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    displayName: text("display_name"),
    normalizedEmail: text("normalized_email"),
    normalizedPhone: text("normalized_phone"),
    domain: text("domain"),
    status: text("entity_status"),
    ownerId: text("owner_id"),
    locked: boolean("locked").notNull().default(false),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    mergedIntoId: uuid("merged_into_id"),
    ...timestamps,
  },
  (table) => [
    index("canonical_entities_org_type_idx").on(table.organizationId, table.entityType),
    index("canonical_entities_org_email_idx").on(table.organizationId, table.normalizedEmail),
    index("canonical_entities_org_domain_idx").on(table.organizationId, table.domain),
  ],
);

export const entityIdentifiers = pgTable(
  "entity_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => canonicalEntities.id, { onDelete: "cascade" }),
    identifierType: text("identifier_type").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    source: text("source").notNull(),
    locked: boolean("locked").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("entity_identifiers_value_uidx").on(
      table.organizationId,
      table.identifierType,
      table.normalizedValue,
    ),
  ],
);

export const activityFacts = pgTable(
  "activity_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id, {
      onDelete: "set null",
    }),
    entityId: uuid("entity_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    personId: uuid("person_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => canonicalEntities.id, {
      onDelete: "set null",
    }),
    opportunityId: uuid("opportunity_id").references(() => canonicalEntities.id, {
      onDelete: "set null",
    }),
    activityType: text("activity_type").notNull(),
    externalId: text("external_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("activity_status"),
    channel: text("channel"),
    ownerId: text("owner_id"),
    amount: numeric("amount", { precision: 20, scale: 4 }),
    durationSeconds: integer("duration_seconds"),
    dimensions: jsonb("dimensions").$type<Record<string, unknown>>().notNull().default({}),
    measures: jsonb("measures").$type<Record<string, number>>().notNull().default({}),
    isDeleted: boolean("is_deleted").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("activity_facts_external_uidx").on(
      table.organizationId,
      table.connectionId,
      table.activityType,
      table.externalId,
    ),
    index("activity_facts_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("activity_facts_org_type_occurred_idx").on(
      table.organizationId,
      table.activityType,
      table.occurredAt,
    ),
    index("activity_facts_org_campaign_occurred_idx").on(
      table.organizationId,
      table.campaignId,
      table.occurredAt,
    ),
  ],
);

export const identityReviewQueue = pgTable(
  "identity_review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id")
      .notNull()
      .references(() => sourceRecords.id, { onDelete: "cascade" }),
    proposedEntityId: uuid("proposed_entity_id")
      .notNull()
      .references(() => canonicalEntities.id, { onDelete: "cascade" }),
    identifierType: text("identifier_type").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    reason: text("reason").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    resolvedByUserId: text("resolved_by_user_id"),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("identity_review_org_status_idx").on(table.organizationId, table.status, table.createdAt),
    uniqueIndex("identity_review_pending_candidate_uidx").on(
      table.organizationId,
      table.sourceRecordId,
      table.proposedEntityId,
      table.identifierType,
    ),
  ],
);

export const identityRules = pgTable(
  "identity_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    matchValue: text("match_value").notNull(),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdByUserId: text("created_by_user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("identity_rules_org_type_value_uidx").on(
      table.organizationId,
      table.ruleType,
      table.matchValue,
    ),
  ],
);

export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    currentPublishedVersion: integer("current_published_version"),
    createdByUserId: text("created_by_user_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("metrics_org_slug_uidx").on(table.organizationId, table.slug),
    index("metrics_org_updated_idx").on(table.organizationId, table.updatedAt),
  ],
);

export const metricVersions = pgTable(
  "metric_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: metricVersionStatusEnum("status").notNull().default("draft"),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    definitionHash: text("definition_hash").notNull(),
    plainLanguage: text("plain_language").notNull(),
    formula: text("formula").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_versions_metric_version_uidx").on(
      table.organizationId,
      table.metricId,
      table.version,
    ),
    index("metric_versions_org_metric_idx").on(table.organizationId, table.metricId),
  ],
);

export const dashboards = pgTable(
  "dashboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    timezone: text("timezone").notNull().default("UTC"),
    defaultDateRange: text("default_date_range").notNull().default("last_30_days"),
    createdByUserId: text("created_by_user_id").notNull(),
    ...timestamps,
  },
  (table) => [index("dashboards_org_updated_idx").on(table.organizationId, table.updatedAt)],
);

export const dashboardCards = pgTable(
  "dashboard_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    metricVersionId: uuid("metric_version_id")
      .notNull()
      .references(() => metricVersions.id, { onDelete: "restrict" }),
    cardType: dashboardCardTypeEnum("card_type").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("dashboard_cards_position_uidx").on(
      table.organizationId,
      table.dashboardId,
      table.position,
    ),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metricVersionId: uuid("metric_version_id")
      .notNull()
      .references(() => metricVersions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    targetValue: numeric("target_value", { precision: 20, scale: 4 }).notNull(),
    direction: text("direction").notNull().default("at_least"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    index("goals_org_period_idx").on(table.organizationId, table.periodStart, table.periodEnd),
  ],
);

export const exportJobs = pgTable(
  "export_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").notNull(),
    dataset: text("dataset").notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    status: exportStatusEnum("status").notNull().default("queued"),
    rowCount: integer("row_count"),
    storageKey: text("storage_key"),
    failureMessage: text("failure_message"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("export_jobs_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const deadLetterEvents = pgTable(
  "dead_letter_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rawEventId: uuid("raw_event_id")
      .notNull()
      .references(() => rawEvents.id, { onDelete: "cascade" }),
    errorCode: text("error_code").notNull(),
    safeErrorMessage: text("safe_error_message").notNull(),
    attempts: integer("attempts").notNull(),
    replayedAt: timestamp("replayed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("dead_letter_raw_event_uidx").on(table.organizationId, table.rawEventId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    safeMetadata: jsonb("safe_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const operationalMeasurements = pgTable(
  "operational_measurements",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    value: numeric("value", { precision: 20, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    outcome: text("outcome").notNull().default("success"),
    safeDimensions: jsonb("safe_dimensions")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("operational_measurements_org_name_recorded_idx").on(
      table.organizationId,
      table.name,
      table.recordedAt,
    ),
    index("operational_measurements_connection_recorded_idx").on(
      table.connectionId,
      table.recordedAt,
    ),
  ],
);
