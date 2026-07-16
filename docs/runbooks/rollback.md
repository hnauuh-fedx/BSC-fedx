# Rollback

Triggers: migration/data invariant failure, authentication outage, cross-scope access, missing audit/version records, sustained 5xx/readiness failure, or Blocker/High security defect. Stop writes and pilot access, preserve logs/correlation IDs, identify last known-good image and backup, notify owners, and record decision time.

Application rollback uses the prior immutable image only when schema compatibility is confirmed. Database rollback is restore-forward into a new database from the verified backup; never reverse-edit migrations or restore over the source. Validate counts, migration status, login, scoped BSC/version reads and audit continuity before switching. Reconcile writes made after backup explicitly; this observed interval is the actual RPO. Obtain a new go/no-go before resuming.
