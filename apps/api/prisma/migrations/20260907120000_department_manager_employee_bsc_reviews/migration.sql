CREATE TABLE "employee_bsc_approval_routes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "department_id" UUID NOT NULL,
  "stage" VARCHAR(20) NOT NULL,
  "reviewer_type" VARCHAR(30) NOT NULL,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_bsc_approval_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_bsc_approval_routes_stage_ck" CHECK ("stage" IN ('PLAN', 'EVALUATION')),
  CONSTRAINT "employee_bsc_approval_routes_reviewer_type_ck" CHECK ("reviewer_type" IN ('DIRECTOR_POOL', 'DEPARTMENT_MANAGER')),
  CONSTRAINT "employee_bsc_approval_routes_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE,
  CONSTRAINT "employee_bsc_approval_routes_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "employee_bsc_approval_routes_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id")
);

CREATE UNIQUE INDEX "employee_bsc_approval_routes_department_stage_uq"
  ON "employee_bsc_approval_routes"("department_id", "stage");
CREATE INDEX "employee_bsc_approval_routes_reviewer_stage_idx"
  ON "employee_bsc_approval_routes"("reviewer_type", "stage");

INSERT INTO "employee_bsc_approval_routes" ("department_id", "stage", "reviewer_type")
SELECT d."id", stage."value", 'DEPARTMENT_MANAGER'
FROM "departments" d
CROSS JOIN (VALUES ('PLAN'), ('EVALUATION')) AS stage("value")
WHERE lower(trim(d."name")) IN (lower('Marketing'), lower('Chăm sóc khách hàng'))
ON CONFLICT ("department_id", "stage") DO UPDATE
SET "reviewer_type" = EXCLUDED."reviewer_type", "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'MANAGER'
  AND p."code" IN (
    'bsc.plan.approve.subordinate',
    'bsc.plan.return.subordinate',
    'bsc.evaluation.approve.subordinate',
    'bsc.evaluation.return.subordinate',
    'bsc.reopen.subordinate',
    'bsc.reset.approved'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

ALTER TABLE "bsc_unlock_requests"
  DROP CONSTRAINT IF EXISTS "bsc_unlock_requests_request_source_check";
ALTER TABLE "bsc_unlock_requests"
  ADD CONSTRAINT "bsc_unlock_requests_request_source_check"
  CHECK ("request_source" IN ('OWNER_REQUEST', 'DIRECTOR_RESET', 'MANAGER_RESET'));
