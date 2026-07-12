CREATE TYPE "public"."dashboard_card_type" AS ENUM('kpi', 'time_series', 'funnel', 'breakdown', 'goal');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."metric_version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."identity_review_status" AS ENUM('pending', 'merged', 'split', 'dismissed');--> statement-breakpoint
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
ALTER TABLE "activity_facts" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "activity_status" text;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "amount" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "activity_facts" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD COLUMN "normalized_email" text;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD COLUMN "entity_status" text;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "canonical_entities" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "normalized_email" text;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "record_status" text;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "owner_external_id" text;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "campaign_external_id" text;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "amount" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "dashboard_cards" ADD CONSTRAINT "dashboard_cards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_cards" ADD CONSTRAINT "dashboard_cards_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_cards" ADD CONSTRAINT "dashboard_cards_metric_version_id_metric_versions_id_fk" FOREIGN KEY ("metric_version_id") REFERENCES "public"."metric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_metric_version_id_metric_versions_id_fk" FOREIGN KEY ("metric_version_id") REFERENCES "public"."metric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_review_queue" ADD CONSTRAINT "identity_review_queue_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_review_queue" ADD CONSTRAINT "identity_review_queue_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_review_queue" ADD CONSTRAINT "identity_review_queue_proposed_entity_id_canonical_entities_id_fk" FOREIGN KEY ("proposed_entity_id") REFERENCES "public"."canonical_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_rules" ADD CONSTRAINT "identity_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_versions" ADD CONSTRAINT "metric_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_versions" ADD CONSTRAINT "metric_versions_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_cards_position_uidx" ON "dashboard_cards" USING btree ("organization_id","dashboard_id","position");--> statement-breakpoint
CREATE INDEX "dashboards_org_updated_idx" ON "dashboards" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "export_jobs_org_created_idx" ON "export_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_org_period_idx" ON "goals" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "identity_review_org_status_idx" ON "identity_review_queue" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_review_pending_candidate_uidx" ON "identity_review_queue" USING btree ("organization_id","source_record_id","proposed_entity_id","identifier_type");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_rules_org_type_value_uidx" ON "identity_rules" USING btree ("organization_id","rule_type","match_value");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_versions_metric_version_uidx" ON "metric_versions" USING btree ("organization_id","metric_id","version");--> statement-breakpoint
CREATE INDEX "metric_versions_org_metric_idx" ON "metric_versions" USING btree ("organization_id","metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_org_slug_uidx" ON "metrics" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "metrics_org_updated_idx" ON "metrics" USING btree ("organization_id","updated_at");--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_person_id_canonical_entities_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_company_id_canonical_entities_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_lead_id_canonical_entities_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_campaign_id_canonical_entities_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_facts" ADD CONSTRAINT "activity_facts_opportunity_id_canonical_entities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."canonical_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_facts_org_type_occurred_idx" ON "activity_facts" USING btree ("organization_id","activity_type","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_facts_org_campaign_occurred_idx" ON "activity_facts" USING btree ("organization_id","campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "canonical_entities_org_email_idx" ON "canonical_entities" USING btree ("organization_id","normalized_email");--> statement-breakpoint
CREATE INDEX "canonical_entities_org_domain_idx" ON "canonical_entities" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE INDEX "source_records_org_email_idx" ON "source_records" USING btree ("organization_id","normalized_email");--> statement-breakpoint
CREATE INDEX "source_records_org_phone_idx" ON "source_records" USING btree ("organization_id","normalized_phone");
--> statement-breakpoint
ALTER TABLE "dashboard_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_review_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metric_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metrics" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "dashboard_cards_tenant_policy" ON "dashboard_cards" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "dashboards_tenant_policy" ON "dashboards" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "export_jobs_tenant_policy" ON "export_jobs" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "goals_tenant_policy" ON "goals" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "identity_review_queue_tenant_policy" ON "identity_review_queue" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "identity_rules_tenant_policy" ON "identity_rules" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "metric_versions_tenant_policy" ON "metric_versions" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "metrics_tenant_policy" ON "metrics" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
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
