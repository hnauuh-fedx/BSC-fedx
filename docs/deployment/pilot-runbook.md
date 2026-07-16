# Staging pilot deployment runbook

## Release inputs

- Record the commit SHA, image digests, operator, approver, deployment window and rollback owner.
- Provision `.env.staging` from the secret store using `.env.staging.example`. Never commit or print it.
- Use distinct 32+ character JWT secrets, an environment-specific PostgreSQL database, exact HTTPS CORS origins and `TRUST_PROXY` for the real proxy hop count.
- Supply bootstrap ADMIN variables only through the secret store. The release seed creates an ADMIN only when none is active; reruns preserve the existing account and password.
- Require the bootstrap ADMIN to change the initial secret-managed password immediately after the first successful login.

## Backup and preflight

1. Put the pilot in a maintenance window and stop writes.
2. Record `npx prisma migrate status --schema apps/api/prisma/schema.prisma`.
3. Create a PostgreSQL custom-format backup with `pg_dump --format=custom --no-owner`. Store its checksum, size, timestamp and restore location outside the application host.
4. Restore that artifact to an isolated database and run the documented restore rehearsal. A backup is accepted only after a successful restore and smoke read.
5. Run `npm ci`, Prisma validate/generate, typecheck, lint, production builds, tests and the fresh migration verification from the release commit.

## Deploy

```text
docker compose -f docker-compose.staging.yml build --pull
docker compose -f docker-compose.staging.yml run --rm migrate
docker compose -f docker-compose.staging.yml run --rm seed
docker compose -f docker-compose.staging.yml up -d api web
```

The only production migration command is `prisma migrate deploy`. Never run `migrate dev`, edit an applied migration or run seed from application startup.

Verify in order:

1. `GET /health` and `GET /health/live` return 200 without a database query.
2. `GET /health/ready` returns 200 and reports only the safe connected status.
3. `prisma migrate status` reports the schema up to date.
4. Login, refresh, logout and an authorized BSC read work through the deployed HTTPS origin.
5. Complete the role-based pilot checklist and monitor 5xx rate, readiness, latency and database connections.

## Rollback

Rollback is triggered by a failed readiness check, an incomplete migration, authentication failure, data-integrity check failure or an unaccepted UAT blocker.

1. Stop web/API traffic and preserve logs/correlation IDs.
2. Do not run a down migration and do not modify migration history.
3. If the migration has not changed data, redeploy the previous immutable API/web image pair.
4. If schema/data changed incompatibly, restore the verified pre-deploy backup into a new database, point the previous API image to it, validate readiness and smoke reads, then reopen traffic.
5. Record the incident, backup identifier, restored database, image digests, validation evidence and go/no-go decision.

JWT secret rollback must be deliberate: reverting a secret changes session validity. Never paste secrets, cookies, authorization headers or database URLs into tickets or logs.
