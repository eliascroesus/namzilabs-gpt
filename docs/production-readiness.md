# Production readiness and launch gate

This document records evidence, not marketing claims. Passing local tests does not mean the service
has passed a production load test, provider approval, tenant-isolation review or restore exercise.
Namzi Data must not publish a contractual SLA until real traffic establishes a reliable baseline.

## Internal service objectives

| Signal                   | Initial engineering objective | Evidence source                                                        |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------- |
| Webhook acceptance       | p95 under 1,000 ms            | `webhook_acceptance_ms` after the raw-event/outbox transaction commits |
| Webhook to dashboard     | p95 under 60 seconds          | `webhook_to_dashboard_ms` after canonical facts commit                 |
| Dashboard query          | p95 under 1,500 ms            | `dashboard_query_ms` around saved-metric query plus freshness lookup   |
| Event terminal state     | 100% eventually               | pending age and processed/duplicate/quarantined/dead-letter counts     |
| Duplicate business facts | zero                          | unique source/fact constraints and duplicate-delivery tests            |
| Connection freshness     | always visible                | connection status, last event, last successful sync and sync lag       |

Measurements are tenant-scoped, retained for 30 days and available only to an administrator at
`GET /api/operations/health`. No samples means **unmeasured**, not passing. Provider dashboards must
also be configured: Inngest backlog/failed runs, Neon database health, Vercel function health and
Vercel runtime logs.

## Implemented evidence

- Atomic immutable raw-event and outbox commit with deterministic deduplication.
- Account-level Google authorization with searchable spreadsheet discovery, worksheet metadata, and
  three latest genuine rows in the metric builder.
- Resource-scoped, full paged Google Sheets ingestion begins immediately after a metric selects a worksheet. Durable Inngest reconciliation remains the fallback and scheduled refresh path.
- Tenant-scoped manual refresh synchronizes every active connection and reports partial failures without hiding successful sources.
- Stable Google Sheets row identity and final-scan tombstones for deleted mutable rows.
- Resumable reconciliation runs, one active step per connection and continuation after 100 pages.
- Failed reconciliation state, safe customer errors, failure counters and pause after three
  authorization failures.
- Provider network retry, `Retry-After`, safe schema-drift classification and payload-free errors.
- OAuth state expiry/signature checks, PKCE, refresh-token replacement and provider revocation.
- AES-256-GCM credential encryption with explicit current/previous key versions and a rotation job.
- Browser mutation origin checks, security headers, role checks, tenant predicates and PostgreSQL RLS.
- Immutable audit-log triggers, audited administrative mutations and dead-letter replay.
- Sanitized provider contract fixtures committed under `tests/fixtures/providers`.
- Dependency review, Dependabot and CodeQL workflows.

## External launch gates

These remain open until a human records dated evidence:

- [ ] Vercel production is Pro, the domain is valid, spend management is enabled and alerts reach
      both a primary and backup owner.
- [ ] Neon production is Launch or higher with separate production, staging and preview branches.
- [ ] The production history/backup retention is selected and a restore exercise passes.
- [ ] The prototype password, Inngest and every enabled provider use production-only credentials.
- [ ] Google branding and every requested sensitive scope are approved.
- [ ] Provider production apps, signing secrets, webhooks and callback URLs pass sandbox smoke tests.
- [ ] Vercel error alerts and Inngest failed-run/backlog alerts reach an on-call human.
- [ ] Tenant isolation receives an independent review against a production-like database role.
- [ ] A representative load test exceeds expected launch traffic with headroom and measured p95s.
- [ ] Organization access/deletion and provider revocation are rehearsed end-to-end.
- [ ] A pilot customer compares source counts and dashboard drill-downs over an agreed observation
      period.

## Required account configuration

Vercel Pro owners configure **Team Settings → Billing → Spend Management**, choose a monthly amount,
enable notifications at available thresholds and decide deliberately whether reaching the amount
only alerts or pauses production. A cost limit does not automatically stop usage unless the pause
action is enabled.

In Neon, document the production branch, region, history-retention window, restore owner and the
date/result of the latest exercise. In Inngest, compare measured backlog and concurrent steps with
the paid plan before choosing capacity; code concurrency limits are safety controls, not a substitute
for account capacity.

References: [Vercel Spend Management](https://vercel.com/docs/spend-management),
[Neon point-in-time restore](https://neon.com/blog/announcing-point-in-time-restore), and
[Inngest observability](https://www.inngest.com/docs/platform/monitor/observability-metrics).
