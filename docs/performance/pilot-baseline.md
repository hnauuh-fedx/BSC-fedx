# Pilot performance baseline

No SLA is inferred. Run against localhost/staging only:

`PERF_BASE_URL=http://127.0.0.1:3000 npm run baseline:performance --workspace=apps/api`

Default load is 50 concurrent requests × 20 iterations. With a runtime bearer token and BSC ID it covers BSC list/detail, pending plan/evaluation/reopen and version list; otherwise it records readiness only. Output includes p50/p95/p99, error count, statuses and throughput. Never store the bearer token.

Before pilot, use an isolated prefixed fixture sized to at least 100 users, 1,000 BSCs, 5–20 KPIs/BSC, versions and pending queues; clean only that prefix. Record hardware/container limits, DB size, dataset counts, command, timestamp and result here. Capacity acceptance belongs to the pilot owner, not the script.

## Local observation — 2026-07-15

- Fixture: 101 users, 1,000 BSCs, 5,000 KPI items in `bsc_organization_test`; prefix cleanup verified zero.
- Load: readiness only, 50 concurrent × 20 iterations = 1,000 requests.
- Observed: p50 23.22 ms, p95 38.08 ms, p99 60.48 ms, 0 HTTP errors, 1,344.7 requests/s over 0.74 s.
- Limitation: authenticated list/detail/workflow endpoints were not baselined in this run, so this evidence is not sufficient for a capacity decision.
