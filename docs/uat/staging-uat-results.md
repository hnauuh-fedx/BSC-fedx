# Staging pilot UAT results

## Deployment and UAT status

| ID | Role | Page/route | Steps | Expected | Actual | Severity | Screenshot or note | Status |
|---|---|---|---|---|---|---|---|---|
| UAT-ENV-001 | OPS | Staging deployment | Follow `docs/deployment/pilot-runbook.md`; locate the approved staging target, secret-managed `.env.staging`, PostgreSQL backup/restore location, deploy access and public Web/API URLs. | Staging prerequisites are supplied without using production or local secrets; database backup and restore rehearsal can be completed before migration. | Repository contains only placeholder `.env.staging.example`. No `.env.staging`, staging URL, staging database credential, backup destination, Git remote/deploy pipeline or Kubernetes context is available in this workspace. `docker-compose.staging.yml` expects an external PostgreSQL host named `postgres`. | BLOCKER | Preflight performed on 2026-07-16 at commit `4b70d7c`. Local `.env` was not used as staging configuration and no secret values were printed. | BLOCKED — awaiting staging target, secret-store material, deployment access, backup owner/location and deployment window approval. |
| UAT-USER-001 | ALL | Staging USER UAT | Coordinate representative ADMIN, DIRECTOR, MANAGER and EMPLOYEE users to execute the checklist and both mandatory workflows on the deployed staging environment. | Real users execute the scenarios and record PASS/FAIL/BLOCKED with notes; the agent does not self-approve USER UAT. | No deployed staging environment or named user representatives/UAT confirmation are available, so USER UAT and retest cannot start. | BLOCKER | Both mandatory workflows remain NOT RUN. | BLOCKED — awaiting real-user coordination after staging deployment. |

## Mandatory workflow status

| Workflow | Status | Note |
|---|---|---|
| Workflow 1 — EMPLOYEE return/resubmit through final approval | NOT RUN | Requires deployed staging and representative EMPLOYEE/MANAGER users. |
| Workflow 2 — MANAGER submission through DIRECTOR approval | NOT RUN | Requires deployed staging and representative MANAGER/DIRECTOR users. |

## Scope decisions

- Attachment upload: **BLOCKED — not supported in the current pilot scope**.
- Adjustment score, payroll lock, templates, export, notifications, new deadlines and quarterly cycles were not opened or changed.
- No USER UAT scenario is marked PASS by the developer or agent.

## Required unblock information

1. Approved staging Web URL and API URL.
2. Secret-store provisioned `.env.staging` or an authorized deployment mechanism that injects equivalent values.
3. Staging PostgreSQL endpoint and confirmation that it is not production.
4. Backup destination, restore-rehearsal database, maintenance window, operator, approver and rollback owner.
5. Access to the deployment host/pipeline and its immutable image or release identifiers.
6. Named representatives and schedule for ADMIN, DIRECTOR, MANAGER and EMPLOYEE UAT; credentials must be shared through an approved secret channel, never committed or logged.
