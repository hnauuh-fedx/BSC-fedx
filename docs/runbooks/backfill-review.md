# Backfill review

Run the read-only commands:

1. `npm run report:bsc-version-backfill --workspace=apps/api`
2. `npm run report:bsc-workflow-backfill-issues --workspace=apps/api`

The issue report returns `employee_bsc_id`, legacy status, reason and creation time and exits non-zero when ambiguity exists. Zero is a valid explicit result. For every issue, compare owner, reviewer, legacy/current workflow state, scores, reviews/histories and versions. Do not auto-resolve ambiguity or recalculate approved scores. Record the reviewer and disposition outside the database until a separately approved remediation exists.
