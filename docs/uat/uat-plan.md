# UAT plan

Scope: organization access, dual-stage BSC workflow, scoring display, versions, reopen and duplicate. Out of scope: payroll integration, production deployment and unresolved scoring policy.

Environment must be isolated staging/test, migrated with `prisma migrate deploy`, and pass `/health/ready`. Seed with runtime `UAT_PASSWORD` and `npm run uat:seed --workspace=apps/api`; retain the emitted prefix. The fixture creates EMPLOYEE, MANAGER, DIRECTOR, ADMIN and an out-of-scope user, department tree, OPEN/CLOSED cycles, KPI data and all required workflow states. Cleanup uses the exact prefix and never truncates shared data.

Entry: quality gate green, backup restored successfully, no pending migrations, Blocker/High security findings zero, known limitations accepted. Exit: all critical cases pass, cleanup verified, scoring sign-off recorded or pilot explicitly excludes score use.

Defects use Blocker/High/Medium/Low. Blocker or High means no-go. Evidence: case ID, actor, build SHA, correlation ID, expected/actual, screenshot, timestamp and defect link.
