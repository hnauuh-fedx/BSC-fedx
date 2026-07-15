-- Phase 3B.5: immutable approval snapshots, stage-aware reopen requests,
-- and exact approved PLAN provenance for duplicate BSCs.

ALTER TABLE "employee_bsc" DROP CONSTRAINT "employee_bsc_plan_status_check";
ALTER TABLE "employee_bsc" DROP CONSTRAINT "employee_bsc_evaluation_status_check";
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_plan_status_check"
  CHECK ("plan_status" IN ('DRAFT','SUBMITTED','RETURNED','APPROVED','REOPENED'));
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_evaluation_status_check"
  CHECK ("evaluation_status" IN ('NOT_STARTED','DRAFT','SUBMITTED','RETURNED','APPROVED','REOPENED'));

CREATE TABLE "bsc_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_bsc_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "stage" VARCHAR(20) NOT NULL,
  "version_type" VARCHAR(40) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_review_id" UUID,
  "source_reopen_request_id" UUID,
  CONSTRAINT "bsc_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bsc_versions_stage_check" CHECK ("stage" IN ('PLAN','EVALUATION','FULL')),
  CONSTRAINT "bsc_versions_type_check" CHECK ("version_type" IN (
    'PLAN_APPROVED','EVALUATION_APPROVED','BEFORE_PLAN_REOPEN','BEFORE_EVALUATION_REOPEN','MIGRATION_BACKFILL'
  ))
);

CREATE UNIQUE INDEX "bsc_versions_bsc_number_uq" ON "bsc_versions"("employee_bsc_id", "version_number");
CREATE UNIQUE INDEX "bsc_versions_review_type_uq" ON "bsc_versions"("source_review_id", "version_type");
CREATE INDEX "bsc_versions_bsc_stage_type_idx" ON "bsc_versions"("employee_bsc_id", "stage", "version_type");

ALTER TABLE "bsc_versions" ADD CONSTRAINT "bsc_versions_bsc_fk"
  FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "bsc_versions" ADD CONSTRAINT "bsc_versions_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "bsc_versions" ADD CONSTRAINT "bsc_versions_source_review_fk"
  FOREIGN KEY ("source_review_id") REFERENCES "bsc_reviews"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "bsc_unlock_requests"
  ADD COLUMN "stage" VARCHAR(20),
  ADD COLUMN "reviewer_id" UUID,
  ADD COLUMN "source_version_id" UUID,
  ADD COLUMN "resulting_version_id" UUID;

UPDATE "bsc_unlock_requests" request SET
  "stage" = CASE WHEN bsc."evaluation_status" = 'APPROVED' THEN 'EVALUATION' ELSE 'PLAN' END,
  "reviewer_id" = COALESCE(request."reviewed_by", bsc."direct_manager_id"),
  "allowed_fields" = COALESCE(request."allowed_fields", CASE
    WHEN bsc."evaluation_status" = 'APPROVED' THEN '["actualValue","actualText","employeeNote"]'::jsonb
    ELSE '["definition"]'::jsonb END)
FROM "employee_bsc" bsc
WHERE bsc."id" = request."employee_bsc_id";

ALTER TABLE "bsc_unlock_requests" ALTER COLUMN "stage" SET NOT NULL;
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_stage_check"
  CHECK ("stage" IN ('PLAN','EVALUATION'));
CREATE UNIQUE INDEX "bsc_unlock_requests_pending_stage_uq"
  ON "bsc_unlock_requests"("employee_bsc_id", "stage") WHERE "status" = 'PENDING';
CREATE INDEX "bsc_unlock_requests_reviewer_status_stage_idx"
  ON "bsc_unlock_requests"("reviewer_id", "status", "stage");
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_reviewer_fk"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_source_version_fk"
  FOREIGN KEY ("source_version_id") REFERENCES "bsc_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_resulting_version_fk"
  FOREIGN KEY ("resulting_version_id") REFERENCES "bsc_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "bsc_versions" ADD CONSTRAINT "bsc_versions_source_reopen_fk"
  FOREIGN KEY ("source_reopen_request_id") REFERENCES "bsc_unlock_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "employee_bsc" ADD COLUMN "source_bsc_version_id" UUID;
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_source_version_fk"
  FOREIGN KEY ("source_bsc_version_id") REFERENCES "bsc_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Backfill approved PLAN definitions without changing workflow state or score data.
INSERT INTO "bsc_versions" (
  "employee_bsc_id", "version_number", "stage", "version_type", "snapshot", "created_by", "created_at", "source_review_id"
)
SELECT bsc."id", 1, 'PLAN', 'PLAN_APPROVED',
  jsonb_build_object(
    'formatVersion', 1,
    'backfilled', true,
    'bscId', bsc."id",
    'cycle', jsonb_build_object('id', cycle."id", 'code', cycle."code", 'name', cycle."name", 'year', cycle."year", 'month', cycle."month"),
    'employee', jsonb_build_object('id', owner_user."id", 'employeeCode', owner_user."employee_code", 'fullName', owner_user."full_name"),
    'department', jsonb_build_object('id', department."id", 'code', department."code", 'name', department."name"),
    'position', jsonb_build_object('id', position."id", 'code', position."code", 'name', position."name", 'level', position."level"),
    'reviewer', jsonb_build_object('id', reviewer."id", 'employeeCode', reviewer."employee_code", 'fullName', reviewer."full_name"),
    'planStatus', bsc."plan_status",
    'approvedAt', bsc."plan_approved_at",
    'approvedBy', bsc."plan_approved_by",
    'totalWeight', COALESCE(items."total_weight", 0),
    'items', COALESCE(items."definitions", '[]'::jsonb)
  ),
  COALESCE(bsc."plan_approved_by", bsc."direct_manager_id"),
  COALESCE(bsc."plan_approved_at", bsc."updated_at"),
  review."id"
FROM "employee_bsc" bsc
JOIN "bsc_cycles" cycle ON cycle."id" = bsc."cycle_id"
JOIN "users" owner_user ON owner_user."id" = bsc."employee_id"
JOIN "departments" department ON department."id" = bsc."department_id"
JOIN "positions" position ON position."id" = bsc."position_id"
JOIN "users" reviewer ON reviewer."id" = bsc."direct_manager_id"
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(item."weight"), 0) AS "total_weight",
    jsonb_agg(jsonb_build_object(
      'id', item."id", 'kpiCode', item."kpi_code", 'kpiName', item."kpi_name",
      'description', item."description", 'measurementUnit', item."measurement_unit",
      'targetValue', item."target_value", 'targetText', item."target_text", 'weight', item."weight",
      'calculationMethod', item."calculation_method", 'sortOrder', item."sort_order"
    ) ORDER BY item."sort_order", item."created_at") AS "definitions"
  FROM "employee_bsc_items" item WHERE item."employee_bsc_id" = bsc."id"
) items ON true
LEFT JOIN LATERAL (
  SELECT r."id" FROM "bsc_reviews" r
  WHERE r."employee_bsc_id" = bsc."id" AND r."stage" = 'PLAN' AND r."action" = 'APPROVE'
  ORDER BY r."reviewed_at" DESC, r."id" DESC LIMIT 1
) review ON true
WHERE bsc."plan_status" = 'APPROVED'
  AND NOT EXISTS (SELECT 1 FROM "bsc_versions" v WHERE v."employee_bsc_id" = bsc."id" AND v."version_type" = 'PLAN_APPROVED');

-- Backfill evaluation snapshots using persisted official values only. No score is recalculated.
INSERT INTO "bsc_versions" (
  "employee_bsc_id", "version_number", "stage", "version_type", "snapshot", "created_by", "created_at", "source_review_id"
)
SELECT bsc."id", COALESCE((SELECT MAX(v."version_number") FROM "bsc_versions" v WHERE v."employee_bsc_id" = bsc."id"), 0) + 1,
  'EVALUATION', 'EVALUATION_APPROVED',
  jsonb_build_object(
    'formatVersion', 1,
    'backfilled', true,
    'backfillAmbiguous', true,
    'backfillNote', 'Raw and rounded scoring breakdown was not persisted before Phase 3B.5; official totals are preserved without recalculation.',
    'bscId', bsc."id",
    'planVersionId', plan_version."id",
    'evaluationStatus', bsc."evaluation_status",
    'approvedAt', bsc."evaluation_approved_at",
    'approvedBy', bsc."evaluation_approved_by",
    'managerTotalScore', bsc."manager_total_score",
    'finalScore', bsc."final_score",
    'finalGrade', bsc."final_grade",
    'items', COALESCE(items."results", '[]'::jsonb)
  ),
  COALESCE(bsc."evaluation_approved_by", bsc."direct_manager_id"),
  COALESCE(bsc."evaluation_approved_at", bsc."updated_at"),
  review."id"
FROM "employee_bsc" bsc
LEFT JOIN LATERAL (
  SELECT v."id" FROM "bsc_versions" v
  WHERE v."employee_bsc_id" = bsc."id" AND v."version_type" = 'PLAN_APPROVED'
  ORDER BY v."version_number" DESC LIMIT 1
) plan_version ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', item."id", 'kpiCode', item."kpi_code", 'kpiName', item."kpi_name",
    'targetValue', item."target_value", 'targetText', item."target_text", 'weight', item."weight",
    'calculationMethod', item."calculation_method", 'actualValue', item."actual_value",
    'actualText', item."actual_text", 'employeeNote', item."employee_note",
    'achievementPercent', item."achievement_percent", 'employeeScore', item."employee_score",
    'managerScore', item."manager_score", 'finalScore', item."final_score", 'sortOrder', item."sort_order"
  ) ORDER BY item."sort_order", item."created_at") AS "results"
  FROM "employee_bsc_items" item WHERE item."employee_bsc_id" = bsc."id"
) items ON true
LEFT JOIN LATERAL (
  SELECT r."id" FROM "bsc_reviews" r
  WHERE r."employee_bsc_id" = bsc."id" AND r."stage" = 'EVALUATION' AND r."action" = 'APPROVE'
  ORDER BY r."reviewed_at" DESC, r."id" DESC LIMIT 1
) review ON true
WHERE bsc."evaluation_status" = 'APPROVED'
  AND NOT EXISTS (SELECT 1 FROM "bsc_versions" v WHERE v."employee_bsc_id" = bsc."id" AND v."version_type" = 'EVALUATION_APPROVED');

INSERT INTO "bsc_workflow_backfill_issues" ("employee_bsc_id", "legacy_status", "reason")
SELECT bsc."id", bsc."status", 'Phase 3B.5 preserved official evaluation totals, but pre-version raw/rounded item scoring was not available.'
FROM "employee_bsc" bsc
WHERE bsc."evaluation_status" = 'APPROVED'
ON CONFLICT ("employee_bsc_id") DO NOTHING;
