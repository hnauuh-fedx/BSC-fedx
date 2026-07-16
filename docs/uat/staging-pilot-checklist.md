# Phase 3E.2 staging pilot UAT

Use one status for every row: `PASS`, `FAIL`, `BLOCKED`, `READY`, `OUT_OF_SCOPE`. Put evidence or limitations in `NOTE`. A `FAIL` or `BLOCKED` prevents pilot go-live unless the named decision owner accepts it in writing.

## Staging deployment / USER UAT gate (2026-07-16)

| Gate | Status | Note / evidence |
|---|---|---|
| Approved staging target and secret-managed configuration | BLOCKED | `.env.staging` and real Web/API/database targets are not available in this workspace; only placeholders exist. Local configuration was not substituted. See `staging-uat-results.md` (`UAT-ENV-001`). |
| Pre-deploy backup and restore rehearsal | BLOCKED | Cannot run safely until the staging database, backup destination, maintenance window, operator, approver and rollback owner are supplied. |
| Staging migration, seed, API and Web deployment | BLOCKED | No deployment host, pipeline, Git remote or Kubernetes context is configured. |
| ADMIN representative USER UAT | BLOCKED | NOT RUN — requires deployed staging and a real user representative. |
| DIRECTOR representative USER UAT | BLOCKED | NOT RUN — requires deployed staging and a real user representative. |
| MANAGER representative USER UAT | BLOCKED | NOT RUN — requires deployed staging and a real user representative. |
| EMPLOYEE representative USER UAT | BLOCKED | NOT RUN — requires deployed staging and a real user representative. |
| Mandatory Workflow 1 and Workflow 2 | BLOCKED | NOT RUN — real users must complete both workflows on staging. |

Current staging decision: **NO-GO**. This does not invalidate the developer-operated local runtime smoke below; it records that staging deployment and USER UAT have not occurred.

## Landing & Navigation

| Actor | Scenario | Expected result | Status | Note / evidence |
|---|---|---|---|---|
| ALL | Landing route after login | Route determined by permission, not role name | READY | `landing.ts` uses permission-only dispatch |
| EMPLOYEE | Login, verify navigation | Personal BSC visible; management and administration menus hidden | READY | `main-layout.tsx` checks permissions |
| MANAGER | Login, verify navigation | BSC cá nhân + management menus visible per permissions | READY | |
| DIRECTOR | Login, verify navigation | Unit dashboard landing; no personal BSC menu or create action | READY | DIRECTOR has no `bsc.create.own` / `bsc.view.own` |
| ADMIN | Login, verify navigation | Administration landing; roles/permissions and audit log accessible if granted | READY | |

### Developer runtime smoke (2026-07-16)

This table records developer-operated runtime verification only. It is not end-user acceptance.

| Actor | DEVELOPER SMOKE | USER UAT | Runtime evidence |
|---|---|---|---|
| EMPLOYEE | PASS | NOT RUN | Actual login landed at `/employee-bsc`; personal BSC navigation was visible; administration, role, audit and review navigation stayed hidden. Landing refresh, `/`, direct `/employee-bsc`, denied `/management/roles`, logout and Back were safe. |
| MANAGER | PASS | NOT RUN | Actual login landed at `/employee-bsc`; personal BSC, overview and pending-review navigation were visible; subordinate fixture data was visible while outside-scope data was absent. A submitted MANAGER-owned fixture was excluded from the MANAGER review queue. Landing refresh, `/`, direct overview/review, denied roles route, logout and Back were safe. |
| DIRECTOR | PASS | NOT RUN | Actual login landed at `/management/bsc-overview`; overview and review navigation were visible; no personal BSC navigation/create/duplicate action appeared. Landing refresh, `/`, direct overview/review, denied `/employee-bsc/new`, logout and Back were safe. |
| ADMIN | PASS | NOT RUN | Actual login landed at `/management`; users, departments, positions, BSC cycles, roles/permissions and audit navigation were visible; role and audit screens opened; pending review and BSC review actions stayed unavailable. Landing refresh, `/`, valid role/audit URLs, denied review URL, logout and Back were safe. |
| NO_PERMISSION | PASS | NOT RUN | Active user with zero permissions landed at `/forbidden`; no navigation was rendered; refresh, `/` and direct protected URL remained forbidden; logout and Back returned safely to `/login`. |

Runtime session evidence: PostgreSQL was healthy; all migrations were deployed; release seed was rerun idempotently; `/health`, `/health/live` and `/health/ready` returned HTTP 200; refresh-cookie restoration survived full browser reload; protected original URL was restored after login; no blocking CORS, console, page or HTTP errors remained before logout. Expected requests interrupted by logout are not counted as runtime page errors.

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
| OPS | Check `/health`, `/health/live`, `/health/ready` | Liveness is lightweight; readiness reflects database availability | READY | DEVELOPER SMOKE: PASS — all three endpoints returned HTTP 200; readiness reported database connected. USER UAT: NOT RUN. |
| OPS | Rerun release seed | Counts remain stable and existing ADMIN password is unchanged | READY | DEVELOPER SMOKE: PASS — release seed completed twice with `bootstrapAdmin: preserved`; no duplicate role/permission or `system.*` permission was created. USER UAT: NOT RUN. |

## Blocked / Out of Scope

| Feature | Status | Reason |
|---|---|---|
| Attachment upload (minh chứng) | BLOCKED | Backend attachment module has no storage API; UI shows clear "not available" notice instead of fake upload |
| Adjustment score (điểm phát sinh) | OUT_OF_SCOPE | Not in pilot scope |
| Payroll lock | OUT_OF_SCOPE | Not in pilot scope |
| BSC templates | OUT_OF_SCOPE | Not in pilot scope |

---

Sign-off: release SHA `91dd44d` plus the runtime-verification commit, environment `local disposable UAT database`, tester `Codex developer runtime smoke`, decision owner ___, date/time `2026-07-16`, final decision `BLOCKED`, limitations `USER UAT NOT RUN; attachment upload remains BLOCKED for pilot`.

> **NOTE**: `READY` means the feature is implemented and statically verified. It does not mean a real user has performed UAT. `PASS` in the canonical scenario `Status` column must be recorded only after actual user verification; `DEVELOPER SMOKE: PASS` records developer-operated runtime evidence only.
