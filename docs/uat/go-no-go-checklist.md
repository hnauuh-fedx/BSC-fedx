# Limited pilot go/no-go checklist

- [ ] Staging images build and run as non-root; no `.env` in image.
- [ ] `/health/live` and `/health/ready` pass; unavailable DB makes readiness non-2xx.
- [ ] `prisma migrate deploy` rehearsed on fresh and data-bearing clones; zero pending migrations.
- [ ] Backup restore rehearsal passed with matching counts and read/login/BSC/version smoke.
- [ ] All unit/integration tests and two Chromium E2E runs pass in CI.
- [ ] Security smoke has zero open Blocker/High findings.
- [ ] Performance baseline recorded without invented SLA; observed capacity accepted.
- [ ] UAT has zero open Blocker/High; fixture cleanup verified.
- [ ] Scoring sign-off complete, or pilot charter explicitly prohibits score/payroll decisions.
- [ ] Monitoring owner, rollback operator and pilot support channel named.
- [ ] Rollback trigger and backup identifier recorded.

## Latest automated evidence (2026-07-16)

- Workspace tests: 91 passed, 0 failed; direct live-database integration run: 38 passed, 0 failed.
- Security smoke: 38 passed, 0 failed; typecheck, lint and production builds passed.
- Fresh migration verification: 8/8 applied; backfill ambiguity report: 0 issues.
- UAT fixture and 1,000-BSC performance fixture both cleaned every marker-owned entity to zero on `bsc_organization_test`.
- Data-bearing deploy and restored-clone rehearsal both failed at `20260715091537_bsc`: index `bsc_approval_steps_order_uq` does not exist. The disposable restore database was removed by `finally` cleanup.
- Human UAT, scoring sign-off, authenticated workflow performance acceptance and named operational owners remain outstanding.

Decision: **NOT READY**

Decision owner/date: Pending human go/no-go

Conditions/limitations: Do not start pilot or use scores for payroll/formal decisions until the data-bearing migration is corrected and every unchecked gate is accepted.
