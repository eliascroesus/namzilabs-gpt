# Data lifecycle and deletion procedure

Customer content is retained only for the configured customer/legal period. A final production
retention schedule for raw events, normalized records, exports, audit evidence and backups must be
approved before paid use; the code must not invent that legal decision. Operational SLO measurements
have a separate 30-day deletion job.

## Connection disconnect

An administrator disconnecting a connection triggers provider revocation where supported, deletes
the local encrypted credentials and marks the connection unavailable. Choosing `deleteData=true`
deletes the connection and its tenant-scoped dependent events, records, facts, cursors and sync runs
through foreign-key cascades. The action is written to the immutable audit log.

## Organization request

Until automated organization deletion is implemented and tested, organization deletion is a
controlled support procedure and remains a launch gate:

1. Verify the requester is the organization owner using an authenticated channel and record scope.
2. Export data only if requested and authorized; record the export in the audit log.
3. Revoke each provider connection and confirm remote subscription/channel deletion.
4. Rotate the shared prototype password to end outstanding sessions and block further access.
5. Delete the organization row so tenant-owned application data cascades.
6. Delete any export objects, support attachments and non-database copies.
7. Record backup-expiry timing; do not claim immediate deletion from immutable disaster-recovery
   copies when the documented retention window still applies.
8. Send completion confirmation without including customer content.

GDPR access, correction, portability and deletion requests go to privacy@namzilabs.co. Legal holds
must be approved and documented, not inferred by application code.
