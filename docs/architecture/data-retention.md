# Data retention and privacy

Proposed policy pending legal/business approval:

| Data | Retention trigger | Disposal/access |
|---|---|---|
| Approved BSC versions and workflow audit | Business/legal policy; immutable while retained | Restricted reporting access; controlled archival |
| Reopen/review/history | Same as parent BSC | No routine hard delete |
| Evidence attachments | Minimum necessary business/legal period | Encrypted storage; path never exposed; secure deletion |
| Refresh tokens | Expiry/revocation plus short operational buffer | Hash only; purge expired records |
| Application/security logs | Short operational window | Redacted; least privilege; correlation ID, no secrets |
| UAT/performance fixtures | End of test session | Prefix-only cleanup, verified zero |
| Backups | Approved RPO/legal schedule | Encrypted, access logged, restore-tested, expiry deletion |

Data-subject correction must preserve audit/version integrity. Legal hold overrides disposal. Owners, exact durations, residency and deletion verification remain open questions and must be approved before production.

## Storage measurement

Test DB measurement on 2026-07-16 returned `0` persisted `bsc_versions`, so average snapshot size and 100/1,000-user projections cannot yet be calculated honestly. Before limited pilot, populate representative approved PLAN/EVALUATION/reopen versions, record `AVG(pg_column_size(snapshot))`, observed versions per user/year, attachment bytes, then project:

- 100 users: `average snapshot bytes × versions/user/year × 100`.
- 1,000 users: `average snapshot bytes × versions/user/year × 1,000`.

This missing representative measurement remains a go/no-go evidence gap.
