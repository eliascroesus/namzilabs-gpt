CREATE TYPE "public"."connection_status" AS ENUM('draft', 'active', 'delayed', 'error', 'paused', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."dashboard_card_type" AS ENUM('kpi', 'time_series', 'funnel', 'breakdown', 'goal');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('pending', 'processed', 'duplicate', 'quarantined', 'dead_lettered');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."metric_version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."identity_review_status" AS ENUM('pending', 'merged', 'split', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "activity_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"source_record_id" uuid,
	"entity_id" uuid,
	"person_id" uuid,
	"company_id" uuid,
	"lead_id" uuid,
	"campaign_id" uuid,
	"opportunity_id" uuid,
	"activity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"activity_status" text,
	"channel" text,
	"owner_id" text,
	"amount" numeric(20, 4),
	"duration_seconds" integer,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"measures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text,
	"safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"display_name" text,
	"normalized_email" text,
	"normalized_phone" text,
	"domain" text,
	"entity_status" text,
	"owner_id" text,
	"locked" boolean DEFAULT false NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"external_account_id" text,
	"external_account_name" text,
	"status" "connection_status" DEFAULT 'draft' NOT NULL,
	"api_version" text NOT NULL,
	"mapping_version" integer DEFAULT 1 NOT NULL,
	"freshness" text DEFAULT 'unknown' NOT NULL,
	"last_event_at" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"metric_version_id" uuid NOT NULL,
	"card_type" "dashboard_card_type" NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_date_range" text DEFAULT 'last_30_days' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dead_letter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"error_code" text NOT NULL,
	"safe_error_message" text NOT NULL,
	"attempts" integer NOT NULL,
	"replayed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encrypted_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"credential_type" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"algorithm" text DEFAULT 'aes-256-gcm' NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"identifier_type" text NOT NULL,
	"normalized_value" text NOT NULL,
	"source" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"dataset" text NOT NULL,
	"query" jsonb NOT NULL,
	"status" "export_status" DEFAULT 'queued' NOT NULL,
	"row_count" integer,
	"storage_key" text,
	"failure_message" text,
	"expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"field_path" text NOT NULL,
	"inferred_type" text NOT NULL,
	"display_name" text NOT NULL,
	"nullable" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"metric_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_value" numeric(20, 4) NOT NULL,
	"direction" text DEFAULT 'at_least' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_record_id" uuid NOT NULL,
	"proposed_entity_id" uuid NOT NULL,
	"identifier_type" text NOT NULL,
	"normalized_value" text NOT NULL,
	"reason" text NOT NULL,
	"status" "identity_review_status" DEFAULT 'pending' NOT NULL,
	"resolved_by_user_id" text,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"match_value" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "metric_version_status" DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"plain_language" text NOT NULL,
	"formula" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"current_published_version" integer,
	"created_by_user_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_measurements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operational_measurements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"connection_id" uuid,
	"name" text NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"unit" text NOT NULL,
	"outcome" text DEFAULT 'success' NOT NULL,
	"safe_dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text,
	"deduplication_key" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_body" text NOT NULL,
	"safe_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"event_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_timezone" text,
	"status" "event_status" DEFAULT 'pending' NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"external_id" text NOT NULL,
	"source_version" text,
	"source_updated_at" timestamp with time zone,
	"occurred_at" timestamp with time zone,
	"display_name" text,
	"normalized_email" text,
	"normalized_phone" text,
	"record_status" text,
	"owner_external_id" text,
	"campaign_external_id" text,
	"amount" numeric(20, 4),
	"currency" text,
	"data" jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"mapping_version" integer NOT NULL,
	"raw_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"cursor" text,
	"high_watermark" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" "sync_status" DEFAULT 'queued' NOT NULL,
	"cursor_start" text,
	"cursor_end" text,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"records_deleted" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text,
	"resource_id" text,
	"callback_token_hash" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_entity_id_canonical_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_person_id_canonical_entities_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_company_id_canonical_entities_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_lead_id_canonical_entities_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_campaign_id_canonical_entities_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_opportunity_id_canonical_entities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD CONSTRAINT "canonical_entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_resources" ADD CONSTRAINT "connection_resources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_resources" ADD CONSTRAINT "connection_resources_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_cards" ADD CONSTRAINT "dashboard_cards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_cards" ADD CONSTRAINT "dashboard_cards_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_cards" ADD CONSTRAINT "dashboard_cards_metric_version_id_metric_versions_id_fk" FOREIGN KEY ("metric_version_id") REFERENCES "public"."metric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_events" ADD CONSTRAINT "dead_letter_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_events" ADD CONSTRAINT "dead_letter_events_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_credentials" ADD CONSTRAINT "encrypted_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_credentials" ADD CONSTRAINT "encrypted_credentials_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_identifiers" ADD CONSTRAINT "entity_identifiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_identifiers" ADD CONSTRAINT "entity_identifiers_entity_id_canonical_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."canonical_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_catalog" ADD CONSTRAINT "field_catalog_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_catalog" ADD CONSTRAINT "field_catalog_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_metric_version_id_metric_versions_id_fk" FOREIGN KEY ("metric_version_id") REFERENCES "public"."metric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_review_queue" ADD CONSTRAINT "identity_review_queue_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_review_queue" ADD CONSTRAINT "identity_review_queue_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_review_queue" ADD CONSTRAINT "identity_review_queue_proposed_entity_id_canonical_entities_id_fk" FOREIGN KEY ("proposed_entity_id") REFERENCES "public"."canonical_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_rules" ADD CONSTRAINT "identity_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_versions" ADD CONSTRAINT "metric_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_versions" ADD CONSTRAINT "metric_versions_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_measurements" ADD CONSTRAINT "operational_measurements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_measurements" ADD CONSTRAINT "operational_measurements_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_facts_external_uidx" ON "activity_facts" USING btree ("organization_id","connection_id","activity_type","external_id");--> statement-breakpoint
CREATE INDEX "activity_facts_org_occurred_idx" ON "activity_facts" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_facts_org_type_occurred_idx" ON "activity_facts" USING btree ("organization_id","activity_type","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_facts_org_campaign_occurred_idx" ON "activity_facts" USING btree ("organization_id","campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "canonical_entities_org_type_idx" ON "canonical_entities" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE INDEX "canonical_entities_org_email_idx" ON "canonical_entities" USING btree ("organization_id","normalized_email");--> statement-breakpoint
CREATE INDEX "canonical_entities_org_domain_idx" ON "canonical_entities" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_resources_external_uidx" ON "connection_resources" USING btree ("organization_id","connection_id","resource_type","external_id");--> statement-breakpoint
CREATE INDEX "connections_org_idx" ON "connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "connections_org_provider_idx" ON "connections" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_cards_position_uidx" ON "dashboard_cards" USING btree ("organization_id","dashboard_id","position");--> statement-breakpoint
CREATE INDEX "dashboards_org_updated_idx" ON "dashboards" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dead_letter_raw_event_uidx" ON "dead_letter_events" USING btree ("organization_id","raw_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "encrypted_credentials_connection_type_uidx" ON "encrypted_credentials" USING btree ("organization_id","connection_id","credential_type");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_identifiers_value_uidx" ON "entity_identifiers" USING btree ("organization_id","identifier_type","normalized_value");--> statement-breakpoint
CREATE INDEX "export_jobs_org_created_idx" ON "export_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "field_catalog_path_uidx" ON "field_catalog" USING btree ("organization_id","connection_id","resource_type","field_path");--> statement-breakpoint
CREATE INDEX "goals_org_period_idx" ON "goals" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "identity_review_org_status_idx" ON "identity_review_queue" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_review_pending_candidate_uidx" ON "identity_review_queue" USING btree ("organization_id","source_record_id","proposed_entity_id","identifier_type");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_rules_org_type_value_uidx" ON "identity_rules" USING btree ("organization_id","rule_type","match_value");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_versions_metric_version_uidx" ON "metric_versions" USING btree ("organization_id","metric_id","version");--> statement-breakpoint
CREATE INDEX "metric_versions_org_metric_idx" ON "metric_versions" USING btree ("organization_id","metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_org_slug_uidx" ON "metrics" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "metrics_org_updated_idx" ON "metrics" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "operational_measurements_org_name_recorded_idx" ON "operational_measurements" USING btree ("organization_id","name","recorded_at");--> statement-breakpoint
CREATE INDEX "operational_measurements_connection_recorded_idx" ON "operational_measurements" USING btree ("connection_id","recorded_at");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox_events" USING btree ("published_at","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_events_dedup_uidx" ON "raw_events" USING btree ("organization_id","connection_id","deduplication_key");--> statement-breakpoint
CREATE INDEX "raw_events_org_received_idx" ON "raw_events" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "raw_events_pending_idx" ON "raw_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_external_uidx" ON "source_records" USING btree ("organization_id","connection_id","resource_type","external_id");--> statement-breakpoint
CREATE INDEX "source_records_org_occurred_idx" ON "source_records" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "source_records_org_email_idx" ON "source_records" USING btree ("organization_id","normalized_email");--> statement-breakpoint
CREATE INDEX "source_records_org_phone_idx" ON "source_records" USING btree ("organization_id","normalized_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursors_resource_uidx" ON "sync_cursors" USING btree ("organization_id","connection_id","resource_type");--> statement-breakpoint
CREATE INDEX "sync_runs_org_connection_idx" ON "sync_runs" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_org_connection_idx" ON "webhook_subscriptions" USING btree ("organization_id","connection_id");
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "organizations_tenant_policy" ON "organizations"
  USING ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encrypted_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connection_resources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_cursors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raw_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "source_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canonical_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entity_identifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_facts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_review_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metric_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dead_letter_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_measurements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "connections_tenant_policy" ON "connections" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "encrypted_credentials_tenant_policy" ON "encrypted_credentials" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "connection_resources_tenant_policy" ON "connection_resources" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "webhook_subscriptions_tenant_policy" ON "webhook_subscriptions" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "sync_cursors_tenant_policy" ON "sync_cursors" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "sync_runs_tenant_policy" ON "sync_runs" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "raw_events_tenant_policy" ON "raw_events" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "outbox_events_tenant_policy" ON "outbox_events" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "source_records_tenant_policy" ON "source_records" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "field_catalog_tenant_policy" ON "field_catalog" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "canonical_entities_tenant_policy" ON "canonical_entities" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "entity_identifiers_tenant_policy" ON "entity_identifiers" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "activity_facts_tenant_policy" ON "activity_facts" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "identity_review_queue_tenant_policy" ON "identity_review_queue" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "identity_rules_tenant_policy" ON "identity_rules" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "metrics_tenant_policy" ON "metrics" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "metric_versions_tenant_policy" ON "metric_versions" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "dashboards_tenant_policy" ON "dashboards" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "dashboard_cards_tenant_policy" ON "dashboard_cards" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "goals_tenant_policy" ON "goals" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "export_jobs_tenant_policy" ON "export_jobs" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "dead_letter_events_tenant_policy" ON "dead_letter_events" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "audit_logs_tenant_policy" ON "audit_logs" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "operational_measurements_tenant_policy" ON "operational_measurements" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
CREATE FUNCTION prevent_raw_event_content_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
    OR NEW.deduplication_key IS DISTINCT FROM OLD.deduplication_key
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.raw_body IS DISTINCT FROM OLD.raw_body
    OR NEW.safe_headers IS DISTINCT FROM OLD.safe_headers
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.event_at IS DISTINCT FROM OLD.event_at
    OR NEW.received_at IS DISTINCT FROM OLD.received_at
  THEN
    RAISE EXCEPTION 'raw event content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "raw_events_content_immutable"
  BEFORE UPDATE ON "raw_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_event_content_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_published_metric_version_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published metric versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "published_metric_versions_immutable"
  BEFORE UPDATE OR DELETE ON "metric_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_published_metric_version_mutation();
