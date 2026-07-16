# UAT test cases

| ID | Actor | Scenario | Expected |
|---|---|---|---|
| UAT-01 | EMPLOYEE | Create/edit/submit valid plan | Submitted; definition locked; snapshot exists |
| UAT-02 | MANAGER | Return then approve employee plan | Reason required; owner can edit only after return |
| UAT-03 | MANAGER | Submit own plan | DIRECTOR is reviewer; self-approval denied |
| UAT-04 | DIRECTOR | Attempt personal BSC | Creation/duplicate denied |
| UAT-05 | outside user | Read/approve fixture BSC | 403 without existence/details leak |
| UAT-06 | EMPLOYEE | Enter actuals and submit evaluation | Server recalculates score; data locks |
| UAT-07 | MANAGER | Return/approve evaluation | Valid transitions only; version/audit created |
| UAT-08 | EMPLOYEE/MANAGER | Request and approve PLAN reopen | Prior snapshot retained; evaluation reset |
| UAT-09 | EMPLOYEE/MANAGER | Request and approve EVALUATION reopen | Plan remains approved; only results editable |
| UAT-10 | EMPLOYEE | Duplicate approved plan to new OPEN cycle | Definition copied; results/evidence/history omitted |
| UAT-11 | EMPLOYEE | Duplicate to CLOSED/existing cycle | Rejected without partial data |
| UAT-12 | all | Browse list/detail/pending/version pages | Permissions, pagination/filter and empty/error states correct |
| UAT-13 | ADMIN | Try approval without business permission | Denied; ADMIN has no implicit approval |
| UAT-14 | security | Inject HTML/SQL-like input and extra fields | Sanitized/validated; no mass assignment or query error leak |
| UAT-15 | operations | Correlate a failed request | Same correlation ID in response and structured server log |
| UAT-16 | ADMIN | Manage users/departments/positions and reset password | Canonical permissions apply; audit contains no password/token |
| UAT-17 | ADMIN | Lock/deactivate/unlock/activate user | Refresh tokens revoked; last active ADMIN protected |
| UAT-18 | EMPLOYEE | Refresh, logout, then reuse revoked refresh token | Refresh works before logout and fails generically after revocation |
| UAT-19 | MANAGER/DIRECTOR | Review employee/manager with direct and fallback reviewer | Correct reviewer only; self/out-of-scope approval denied |

Run supported browser matrix: current Chromium mandatory; Firefox and WebKit smoke when available. Repeat Chromium once after defect fixes.

Defect record fields: ID, case ID, summary, severity, expected/actual, actor, build SHA, environment, correlation ID, evidence, owner, status, change-request link, fix build, retest result/date and final disposition.
