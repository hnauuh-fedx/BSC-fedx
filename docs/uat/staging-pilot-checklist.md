# Phase 3E.2 staging pilot UAT

Use one status for every row: `PASS`, `FAIL`, `BLOCKED`, `READY`, `OUT_OF_SCOPE`. Put evidence or limitations in `NOTE`. A `FAIL` or `BLOCKED` prevents pilot go-live unless the named decision owner accepts it in writing.

## Landing & Navigation

| Actor | Scenario | Expected result | Status | Note / evidence |
|---|---|---|---|---|
| ALL | Landing route after login | Route determined by permission, not role name | READY | `landing.ts` uses permission-only dispatch |
| EMPLOYEE | Login, verify navigation | Personal BSC visible; management and administration menus hidden | READY | `main-layout.tsx` checks permissions |
| MANAGER | Login, verify navigation | BSC cá nhân + management menus visible per permissions | READY | |
| DIRECTOR | Login, verify navigation | Unit dashboard landing; no personal BSC menu or create action | READY | DIRECTOR has no `bsc.create.own` / `bsc.view.own` |
| ADMIN | Login, verify navigation | Administration landing; roles/permissions and audit log accessible if granted | READY | |

## Authentication & Session

| Actor | Scenario | Expected result | Status | Note / evidence |
|---|---|---|---|---|
| ADMIN | Login, refresh page, logout | Session restores through HttpOnly refresh cookie; logout clears it |  |  |
| ADMIN | Create/update a pilot user | User management works and never returns a password hash |  |  |
| ADMIN | Manage pilot department and position | Department/position changes persist within the pilot scope |  |  |

## BSC Workflow

| Actor | Scenario | Expected result | Status | Note / evidence |
|---|---|---|---|---|
| ADMIN | Create, open, close and reopen a monthly cycle | Valid lifecycle transitions succeed and are audited |  |  |
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
| EMPLOYEE | View returned BSC | PLAN and EVALUATION return reasons are shown separately with reviewer and timestamp |  |  |
| MANAGER | Open BSC overview | Only in-scope subordinate rows and dual-stage counts are displayed |  |  |
| MANAGER | Open pending review | PLAN/EVALUATION tabs lead to in-scope review details only |  |  |
| DIRECTOR | Open BSC overview | Manager submissions and eligible direct employee records remain inside scope |  |  |

## Administration

| Actor | Scenario | Expected result | Status | Note / evidence |
|---|---|---|---|---|
| ADMIN | Open administration pages | Canonical technical permissions work; no implicit BSC approval action appears | READY | |
| ADMIN | Manage roles and permissions | `GET /roles`, `GET /roles/:id`, `GET /permissions`, `PUT /roles/:id/permissions` all work with auth | READY | `RolesModule` wired up in Phase 3E.2.1 |
| ADMIN | View audit log | `GET /audit-logs` with pagination/filter, redaction of sensitive fields | READY | `AuditLogsModule` wired up in Phase 3E.2.1 |
| OPS | Check `/health`, `/health/live`, `/health/ready` | Liveness is lightweight; readiness reflects database availability |  |  |
| OPS | Rerun release seed | Counts remain stable and existing ADMIN password is unchanged |  |  |

## Blocked / Out of Scope

| Feature | Status | Reason |
|---|---|---|
| Attachment upload (minh chứng) | BLOCKED | Backend attachment module has no storage API; UI shows clear "not available" notice instead of fake upload |
| Adjustment score (điểm phát sinh) | OUT_OF_SCOPE | Not in pilot scope |
| Payroll lock | OUT_OF_SCOPE | Not in pilot scope |
| BSC templates | OUT_OF_SCOPE | Not in pilot scope |

---

Sign-off: release SHA ___, environment ___, tester ___, decision owner ___, date/time ___, final decision `PASS / FAIL / BLOCKED`, limitations ___ .

> **NOTE**: `READY` means the feature is implemented and statically verified. It does not mean a real user has performed UAT. `PASS` must be recorded only after actual user verification.
