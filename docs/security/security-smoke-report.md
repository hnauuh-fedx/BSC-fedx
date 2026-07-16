# Security smoke report

This is regression smoke, not a penetration test. Command: `npm run smoke:security --workspace=apps/api` plus Chromium UI checks.

Automated coverage: generic login errors/rate limiting; HttpOnly/Secure/SameSite refresh cookie and origin validation; refresh/logout/revocation; organization and BSC scope/IDOR; no implicit ADMIN approval; DTO whitelist/mass-assignment rejection; BSC sort allowlist; snapshot/evidence path and secret omission; correlation/no public stack.

Manual/pentest follow-up: browser XSS/CSP review, SQL-injection fuzzing beyond ORM parameterization and allowlists, deployment TLS/CORS headers, dependency/container scanning and evidence-storage authorization.

Execution on 2026-07-16 against `bsc_organization_test`: the expanded focused run passed **38/38 tests**. No Blocker/High finding was observed within this regression scope.

| Finding | Severity | Status | Regression test/evidence |
|---|---|---|---|
| No open regression finding | — | Pass | `npm run smoke:security --workspace=apps/api` |

Residual risk: this is automated regression coverage, not adversarial penetration testing; deployment network/TLS/secret-store controls require environment review.

Any Blocker/High is pilot no-go. Do not record credentials, tokens, cookies, raw DB URLs or private evidence paths.
