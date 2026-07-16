# Migration rehearsal

Source is exact `bsc_organization_test`; target is generated `bsc_organization_test_rehearsal_<8hex>`. The script refuses `bsc_db`, production-like names and mismatched confirmation. It makes a custom-format backup, restores to the disposable target, runs `prisma migrate deploy`, compares fixed-table counts, checks failed/pending migrations, reports duration/size, then drops only the generated target in `finally`.

Run `npm run rehearsal:migration --workspace=apps/api`. Also run `npm run prisma:test:fresh-verify --workspace=apps/api`. Record source size, backup size, duration, before/after counts, smoke results and any `bsc_workflow_backfill_issues`. Never edit an applied migration; stop on ambiguity. Credentials are not included in the JSON report.
