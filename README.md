# Namzi Data

Production-oriented Phase 1 foundation for a multi-tenant SaaS data aggregation platform. It is a modular Next.js monolith with a strict connector contract, immutable raw event storage, atomic outbox delivery, durable Inngest workflows, Neon/Drizzle persistence, and WorkOS organization sessions.

## Local setup

1. Install Node 22.11+ and pnpm 11.7.
2. Copy `.env.example` to `.env.local`.
3. Create separate Neon development and production branches.
4. Put the pooled Neon URL in `DATABASE_URL` and the direct URL in `DATABASE_DIRECT_URL`.
5. Generate a 32-byte credential encryption key: `openssl rand -base64 32`.
6. Configure WorkOS, Inngest and provider application credentials.
7. Run `pnpm db:migrate`, then `pnpm dev`.

For the production GitHub → Neon → Vercel → `namzilabs.co` sequence, use the [deployment runbook](docs/deployment.md).

Production deliberately fails closed if database, encryption, WorkOS or Inngest configuration is missing. Local and test environments use the explicit `DEV_*` identity only when WorkOS is not configured.

## Data guarantees

- A webhook is acknowledged only after its raw event and outbox item commit in one transaction.
- Delivery is at least once; deterministic idempotency keys produce effectively-once business state.
- Provider payloads remain immutable in `raw_events`.
- Older provider updates cannot overwrite a newer `source_records` version.
- Every event ends as processed, duplicate, quarantined or dead-lettered.
- OAuth/API credentials are AES-256-GCM encrypted and are never returned after initial webhook setup.
- Every tenant query is organization-scoped and the migration also applies PostgreSQL RLS policies.

## Connector implementation order

1. Generic JSON webhook
2. Google Sheets with Drive change notifications
3. Calendly OAuth/webhooks
4. Close OAuth/webhooks and event-log backfill
5. Instantly API v2
6. Brevo API v3

No provider fixtures are shown in production. Live account credentials are required for provider smoke tests and the three-record preview.

## Validation

Run `pnpm check`. Browser tests use `pnpm test:e2e`.
Phase 2 adds the deterministic analytics layer: exact identity resolution, versioned metric definitions, dashboards pinned to metric versions, goals, record drill-down, masked data exploration and audited export jobs. See [Phase 2 analytics operations](docs/phase-2-operations.md) for calculation semantics, performance targets and open environment-dependent gates.
