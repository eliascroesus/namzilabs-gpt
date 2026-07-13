# Incident-response runbook

## Ownership

Before the first customer, name a primary incident commander and a backup. Configure Inngest,
Vercel and Neon alerts to reach both. Every alert must link to this runbook and include the
environment, request/run identifier, affected connector and a sanitized error code.

## Severity

- **SEV-1:** confirmed cross-tenant exposure, credential exposure, destructive data loss or complete
  production outage.
- **SEV-2:** sustained ingestion/dashboard failure for multiple customers, growing queues, failed
  reconciliation or unusable authentication.
- **SEV-3:** isolated connector degradation with stale state clearly visible and a safe workaround.

## First 15 minutes

1. Acknowledge the alert, assign commander/scribe and record UTC start time.
2. Confirm production versus preview; never paste tokens, payloads or connection strings into chat.
3. Preserve request IDs, Inngest run IDs, Vercel log references and relevant audit-log identifiers.
4. For suspected tenant or secret exposure, stop the affected connector/version or production path,
   rotate the credential and preserve evidence before cleanup.
5. For queue growth, stop new fan-out if needed but keep immutable raw events and outbox rows.
6. State what is known, affected, contained and next update time. Do not claim no data loss until raw
   and terminal-state counts reconcile.

## Diagnosis and recovery

- Compare `/api/operations/health` with Inngest backlog/failed runs and Neon/Vercel health.
- Check oldest unpublished outbox row and oldest pending raw event before replaying anything.
- Replay dead letters only after the connector or mapping defect is fixed; idempotency constraints
  must remain enabled.
- If provider authorization repeatedly fails, leave the connection paused and direct the customer
  through reconnect. Never manually insert a token.
- For database corruption or accidental deletion, follow the backup-restore exercise. Restore to an
  isolated branch and validate before any production cutover.

## Closure

Record timeline, customer impact, whether data was delayed/lost/exposed, root cause, detection gap,
corrective owner and due date. Rotate exposed credentials, notify affected customers and regulators
when legally required, and add a regression or recovery test. Hold a blameless review for SEV-1/2.
Do not delete incident evidence under the normal application retention job.
