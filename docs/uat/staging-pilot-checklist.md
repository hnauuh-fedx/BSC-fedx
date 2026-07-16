# Phase 3E.1 staging pilot UAT

Use one status for every row: `PASS`, `FAIL`, `BLOCKED`. Put evidence or limitations in `NOTE`. A `FAIL` or `BLOCKED` prevents pilot go-live unless the named decision owner accepts it in writing.

| Actor | Scenario | Expected result | Status | Note / evidence |
|---|---|---|---|---|
| ADMIN | Login, refresh page, logout | Session restores through HttpOnly refresh cookie; logout clears it |  |  |
| ADMIN | Open administration pages | Canonical technical permissions work; no implicit BSC approval action appears |  |  |
| ADMIN | Create/update a pilot user | User management works and never returns a password hash |  |  |
| ADMIN | Manage pilot department and position | Department/position changes persist within the pilot scope |  |  |
| ADMIN | Create, open, close and reopen a monthly cycle | Valid lifecycle transitions succeed and are audited |  |  |
| ADMIN | Inspect audit access | Audit data is visible without credentials or secret values |  |  |
| EMPLOYEE | Create and save a PLAN draft | Draft persists and remains editable |  |  |
| EMPLOYEE | Submit valid PLAN | PLAN becomes submitted and definition fields lock |  |  |
| MANAGER | Review employee PLAN | In-scope manager can return and approve; cannot self-approve |  |  |
| EMPLOYEE | Enter results after PLAN approval | Only evaluation/result fields are editable |  |  |
| EMPLOYEE | Submit EVALUATION | Complete scoring is accepted and fields lock |  |  |
| EMPLOYEE | Open personal history | PLAN/EVALUATION submission and review history is visible |  |  |
| MANAGER | Approve employee EVALUATION | Final score/grade appears only after approval |  |  |
| MANAGER | Submit own PLAN/EVALUATION | Submission routes to DIRECTOR |  |  |
| DIRECTOR | Review manager BSC | In-scope review works; no personal BSC creation is available |  |  |
| DIRECTOR | Review employee without manager | Review routes to the responsible DIRECTOR |  |  |
| DIRECTOR | Open organization report | Only report rows inside the DIRECTOR scope are visible |  |  |
| ALL | Attempt an out-of-scope record | API returns a safe denial; UI exposes no unauthorized data |  |  |
| OPS | Check `/health`, `/health/live`, `/health/ready` | Liveness is lightweight; readiness reflects database availability |  |  |
| OPS | Rerun release seed | Counts remain stable and existing ADMIN password is unchanged |  |  |

Sign-off: release SHA ___, environment ___, tester ___, decision owner ___, date/time ___, final decision `PASS / FAIL / BLOCKED`, limitations ___ .
