# Environment and staging deployment

Copy `.env.staging.example` to a secret-managed `.env.staging`; never commit it. Required: `NODE_ENV`, `API_PORT`, `DATABASE_URL`, two distinct JWT secrets, expiries and exact HTTPS `CORS_ORIGIN`. Production-mode startup rejects placeholders/short secrets, `bsc_db`, test DB names, HTTP/wildcard CORS. Test mode rejects `bsc_db`.

Build with `docker compose -f docker-compose.staging.yml build`. Run migration as a one-off job first: `docker compose -f docker-compose.staging.yml run --rm migrate`; then start `api` and `web`. Startup never resets or seeds data. The web image serves static SPA files through nginx; hashed assets are immutable and `index.html` is no-cache.

Secrets must come from the deployment secret store. Do not print env, URLs, cookies or auth headers. Rotate JWT secrets through a planned session-revocation window. Restrict DB credentials to the staging DB. Validate `GET /health/live`, `GET /health/ready`, login and a scoped BSC read after deployment.
