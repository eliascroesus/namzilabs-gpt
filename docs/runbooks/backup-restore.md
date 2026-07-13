# Neon backup and restore exercise

Run this exercise before launch and at least quarterly. Record the UTC start/end, selected recovery
point, recovery point objective (RPO), recovery time objective (RTO), operator and result.

1. Confirm the paid Neon plan and configured history-retention window cover the business recovery
   requirement. Do not assume the default window is sufficient.
2. In Neon, use **Restore** and Time Travel Assist to inspect a point before a known test change.
3. Restore that point into an isolated branch first. Never begin the exercise by overwriting the
   production branch.
4. Copy the isolated branch's direct URL into a temporary local variable named
   `RESTORE_DATABASE_URL`. Do not add it to Vercel or Git.
5. Run `pnpm db:verify-restore`. Compare organization, connection, raw-event, source-record and fact
   counts with the recorded pre-exercise expectations.
6. Run read-only drill-down queries for several known events and confirm audit rows and tenant
   boundaries. Confirm migrations and RLS policies exist.
7. Measure RPO and RTO. Delete the temporary branch/credential only after evidence is saved.
8. If an actual cutover is required, announce a write freeze, preserve the current branch, perform
   the restore, wait for Neon operations to complete, validate application health, then resume
   ingestion. Reconcile every active connection after the recovery point.

Neon warns that restore operations briefly interrupt database connections and that a restored active
branch can retain its connection string while its branch ID changes. Retrieve the new branch ID
before later automation. See [Neon Point-in-Time Restore](https://neon.com/blog/announcing-point-in-time-restore).
