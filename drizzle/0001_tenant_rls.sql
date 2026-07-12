-- Defense-in-depth tenant isolation. Runtime application queries also include an
-- explicit organization_id predicate and are covered by tenant-boundary tests.
-- For an RLS-enforced database role, start each transaction with:
--   select set_config('app.organization_id', '<organization uuid>', true);

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_tenant_policy" ON "organizations"
  USING ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE "dead_letter_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_tenant_policy" ON "memberships" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
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
CREATE POLICY "dead_letter_events_tenant_policy" ON "dead_letter_events" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "audit_logs_tenant_policy" ON "audit_logs" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Raw provider content is immutable. Processing metadata may advance as an event
-- moves through pending, processed, quarantined or dead-lettered states.
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

CREATE TRIGGER "raw_events_content_immutable"
  BEFORE UPDATE ON "raw_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_event_content_mutation();

CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
