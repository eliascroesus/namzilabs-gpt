# Phase 2 analytics operations

## Deterministic boundary

Metric definitions are validated with Zod and compiled by `src/server/metrics/compiler.ts`. Dataset, field, operator, aggregation and time-grain identifiers come from static allowlists. Tenant IDs, dates and customer filter values are PostgreSQL parameters. Customer SQL is never accepted. Ratios return `null` when the denominator is zero. Numeric aggregations return `null` when no numeric source value exists; counts return zero.

Published metric versions are immutable at the database layer. A dashboard card stores a `metric_version_id`, so publishing a later version cannot silently change an existing card.

## Reporting time

Events are included using `occurred_at >= start AND occurred_at < end`. Receipt time does not move a late event into the wrong period. Calendar boundaries are derived in the selected IANA timezone and converted to UTC. This makes daylight-saving days 23 or 25 hours when appropriate.

## Identity resolution

Automatic resolution uses exact normalized email, E.164 phone, provider-scoped external ID, customer ID, or an explicitly configured organization rule. A local number without a country code is not normalized. Multiple exact signals pointing to different entities create review rows; no fuzzy or ambiguous match is merged. Administrator decisions are appended to the audit log.

## Query performance target

- Dashboard API p95 target: **under 500 ms** for a dashboard containing 12 cards over 30 days.
- Individual metric SQL p95 target: **under 150 ms** against 1 million activity rows for indexed activity-type/time queries.
- DSL compilation p95 target: **under 5 ms** on the application runtime.
- Dashboard refresh: 20 seconds and browser-focus refetch.

The migration adds `(organization_id, activity_type, occurred_at)` and `(organization_id, campaign_id, occurred_at)` indexes. Before launch, load a representative Neon branch with at least one million skewed activity rows and capture `EXPLAIN (ANALYZE, BUFFERS)` for the twelve-card dashboard. The local test suite measures compiler p95 only; it cannot honestly claim database p95 without a configured Neon database.

## Sensitive data and exports

Metric drill-down selects only public allowlisted columns. Normalized email and phone are marked sensitive and omitted by default. Exports require editor access, create an immutable audit event, and enter the outbox-backed background queue. Production object storage and signed download URLs remain required before export delivery can be enabled.

## Phase 2 acceptance status

Locally verified: deterministic fixtures, field/value validation, division by zero, missing data, DST, late arrivals, ambiguous identity behavior, goal calculation, TypeScript, lint, unit tests, production build, and browser-oriented workflow coverage.

Environment-dependent gates remain open until production-like services are configured: real Neon query p95, migration execution, live provider data drill-down, background export delivery, authenticated RBAC browser coverage, and full Playwright execution in CI.
