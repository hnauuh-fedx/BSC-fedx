# Backup and restore rehearsal

Run `npm run rehearsal:backup-restore --workspace=apps/api` against exact test DB. The source is read-only and is never dropped or overwritten. A generated `bsc_organization_test_restore_<8hex>` receives `pg_restore`, migrations and count verification; it is deleted in `finally`.

Success evidence: backup bytes, elapsed time (observed RPO/RTO evidence, not a promise), matching counts for organization/BSC/item/review/history/audit/version/reopen tables, zero pending migrations, plus login and BSC/version read smoke. Keep encrypted backups only for the retention window and restrict access. On failure, preserve sanitized diagnostics, remove the disposable DB and do not continue rollout.
