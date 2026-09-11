# Environment and staging deployment

Copy `.env.staging.example` to a secret-managed `.env.staging`; never commit it. Required: `NODE_ENV`, either `API_PORT` or `PORT`, `DATABASE_URL`, two distinct JWT secrets, expiries, exact HTTPS `CORS_ORIGIN` values (comma-separated when needed), and explicit `REFRESH_COOKIE_SAME_SITE`. `API_PORT` takes precedence when both port variables are configured; `PORT` is used only when `API_PORT` is missing or blank. Use `lax` behind the included same-origin `/api` proxy; use `none` only for an intentionally cross-site HTTPS frontend/backend deployment. Production-mode startup rejects placeholders/short secrets, `bsc_db`, test DB names, HTTP/wildcard CORS. Test mode rejects `bsc_db`.

Build with `docker compose -f docker-compose.staging.yml build`. Run migration as a one-off job first: `docker compose -f docker-compose.staging.yml run --rm migrate`; then run the idempotent release seed once with `docker compose -f docker-compose.staging.yml run --rm seed` and start `api` and `web`. Startup never migrates, resets or seeds data. The web image serves static SPA files through nginx; hashed assets are immutable and `index.html` is no-cache.

Secrets must come from the deployment secret store. Do not print env, URLs, cookies or auth headers. Rotate JWT secrets through a planned session-revocation window. Restrict DB credentials to the staging DB. Validate `GET /health/live`, `GET /health/ready`, login and a scoped BSC read after deployment.

See [pilot-runbook.md](pilot-runbook.md) for backup, deploy and rollback procedures and `docs/uat/staging-pilot-checklist.md` for role-based sign-off.

## One-time BSC organization transfer backfill

When a user was moved before the organization-transfer workflow was deployed, set
`BSC_TRANSFER_BACKFILL_USER_IDS` to the comma-separated user UUIDs, or set it to
`ALL` to discover active users whose canonical `EMPLOYEE` assignment still uses
a department scope. Set
`BSC_TRANSFER_BACKFILL_ACTOR_ID` to the UUID of the active administrator performing
the repair, and set
`BSC_TRANSFER_BACKFILL_MODE=DRY_RUN` for the first release. The release seed runs
the complete transaction and rolls it back, so the log reports `candidateBscCount`
and `candidateRoleScopeCount` without changing production data. For the selected or
discovered users, active legacy `EMPLOYEE` assignments scoped to a department are
normalized to `SELF`; open-cycle BSC organization metadata is reconciled as before.
After checking the candidates, change the mode to
`APPLY` and deploy again. The idempotent release seed reconciles only BSCs whose cycles are `OPEN`, including
pending approval steps and reopen requests. BSCs in `LOCKED` or `CLOSED` cycles are
preserved as historical snapshots. Check `bscTransferBackfill.transferredBscCount`
in the seed log, verify the new department manager's queue, and then remove all
three one-time environment variables. Re-running the same IDs after reconciliation is a no-op.
