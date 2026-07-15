-- Phase 3B.3 dual-stage workflow. Legacy workflow columns remain for data compatibility,
-- but plan_status/evaluation_status are the canonical transition sources after this migration.
ALTER TABLE "employee_bsc"
  ADD COLUMN "plan_status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "plan_submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "plan_approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "plan_approved_by" UUID,
  ADD COLUMN "evaluation_status" VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "evaluation_submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "evaluation_approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "evaluation_approved_by" UUID;

CREATE TABLE "bsc_workflow_backfill_issues" (
  "employee_bsc_id" UUID PRIMARY KEY,
  "legacy_status" VARCHAR(30) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bsc_workflow_backfill_issues_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE
);

-- Old SUBMITTED/RETURNED/APPROVED records came from the scoring-complete workflow.
-- Records without actual/final evidence are mapped conservatively and explicitly recorded.
UPDATE "employee_bsc" e SET
  "plan_status" = CASE
    WHEN e."status" = 'DRAFT' THEN 'DRAFT'
    WHEN e."status" = 'SUBMITTED' AND NOT (
      EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
      AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL)
    ) THEN 'SUBMITTED'
    WHEN e."status" = 'RETURNED' AND NOT (
      EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
      AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL)
    ) THEN 'RETURNED'
    ELSE 'APPROVED'
  END,
  "evaluation_status" = CASE
    WHEN e."status" = 'DRAFT' THEN 'NOT_STARTED'
    WHEN e."status" = 'SUBMITTED' AND EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
      AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL) THEN 'SUBMITTED'
    WHEN e."status" = 'RETURNED' AND EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
      AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL) THEN 'RETURNED'
    WHEN e."status" = 'APPROVED' AND e."final_score" IS NOT NULL AND e."final_grade" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
      AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL) THEN 'APPROVED'
    WHEN e."status" = 'APPROVED' THEN 'DRAFT'
    ELSE 'NOT_STARTED'
  END,
  "plan_submitted_at" = CASE WHEN e."status" <> 'DRAFT' THEN e."submitted_at" END,
  "plan_approved_at" = CASE WHEN e."status" = 'APPROVED' OR (e."status" IN ('SUBMITTED', 'RETURNED')
    AND EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
    AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL))
    THEN COALESCE(e."approved_at", e."submitted_at") END,
  "plan_approved_by" = CASE WHEN e."status" = 'APPROVED' OR (e."status" IN ('SUBMITTED', 'RETURNED')
    AND EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
    AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL))
    THEN COALESCE(e."approved_by", e."direct_manager_id") END,
  "evaluation_submitted_at" = CASE WHEN e."status" IN ('SUBMITTED', 'RETURNED', 'APPROVED')
    AND EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
    AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL)
    THEN e."submitted_at" END,
  "evaluation_approved_at" = CASE WHEN e."status" = 'APPROVED' AND e."final_score" IS NOT NULL AND e."final_grade" IS NOT NULL THEN e."approved_at" END,
  "evaluation_approved_by" = CASE WHEN e."status" = 'APPROVED' AND e."final_score" IS NOT NULL AND e."final_grade" IS NOT NULL THEN e."approved_by" END;

INSERT INTO "bsc_workflow_backfill_issues" ("employee_bsc_id", "legacy_status", "reason")
SELECT e."id", e."status", 'Legacy workflow state lacks actual/final evidence; verify stage assignment manually.'
FROM "employee_bsc" e
WHERE (e."status" IN ('SUBMITTED', 'RETURNED', 'APPROVED') AND NOT (
  EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id")
  AND NOT EXISTS (SELECT 1 FROM "employee_bsc_items" i WHERE i."employee_bsc_id" = e."id" AND i."actual_value" IS NULL)
)) OR (e."status" = 'APPROVED' AND (e."final_score" IS NULL OR e."final_grade" IS NULL));

ALTER TABLE "bsc_approval_steps" ADD COLUMN "stage" VARCHAR(20);
ALTER TABLE "bsc_reviews" ADD COLUMN "stage" VARCHAR(20);
ALTER TABLE "bsc_status_histories" ADD COLUMN "stage" VARCHAR(20);
UPDATE "bsc_approval_steps" child SET "stage" = CASE
  WHEN bsc."evaluation_status" IN ('SUBMITTED','RETURNED','APPROVED') THEN 'EVALUATION' ELSE 'PLAN' END
FROM "employee_bsc" bsc WHERE bsc."id" = child."employee_bsc_id";
UPDATE "bsc_reviews" child SET "stage" = CASE
  WHEN bsc."evaluation_status" IN ('SUBMITTED','RETURNED','APPROVED') THEN 'EVALUATION' ELSE 'PLAN' END
FROM "employee_bsc" bsc WHERE bsc."id" = child."employee_bsc_id";
UPDATE "bsc_status_histories" child SET "stage" = CASE
  WHEN bsc."evaluation_status" IN ('SUBMITTED','RETURNED','APPROVED') THEN 'EVALUATION' ELSE 'PLAN' END
FROM "employee_bsc" bsc WHERE bsc."id" = child."employee_bsc_id";
ALTER TABLE "bsc_approval_steps" ALTER COLUMN "stage" SET NOT NULL;
ALTER TABLE "bsc_reviews" ALTER COLUMN "stage" SET NOT NULL;
ALTER TABLE "bsc_status_histories" ALTER COLUMN "stage" SET NOT NULL;

DROP INDEX "bsc_approval_steps_order_uq";
CREATE UNIQUE INDEX "bsc_approval_steps_stage_order_uq" ON "bsc_approval_steps"("employee_bsc_id", "stage", "step_order");
CREATE INDEX "employee_bsc_plan_status_idx" ON "employee_bsc"("plan_status");
CREATE INDEX "employee_bsc_evaluation_status_idx" ON "employee_bsc"("evaluation_status");
CREATE INDEX "bsc_status_histories_bsc_stage_idx" ON "bsc_status_histories"("employee_bsc_id", "stage", "changed_at");

ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_plan_approved_by_fk" FOREIGN KEY ("plan_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_evaluation_approved_by_fk" FOREIGN KEY ("evaluation_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_plan_status_check" CHECK ("plan_status" IN ('DRAFT','SUBMITTED','RETURNED','APPROVED'));
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_evaluation_status_check" CHECK ("evaluation_status" IN ('NOT_STARTED','DRAFT','SUBMITTED','RETURNED','APPROVED'));
ALTER TABLE "bsc_approval_steps" ADD CONSTRAINT "bsc_approval_steps_stage_check" CHECK ("stage" IN ('PLAN','EVALUATION'));
ALTER TABLE "bsc_reviews" ADD CONSTRAINT "bsc_reviews_stage_check" CHECK ("stage" IN ('PLAN','EVALUATION'));
ALTER TABLE "bsc_status_histories" ADD CONSTRAINT "bsc_status_histories_stage_check" CHECK ("stage" IN ('PLAN','EVALUATION'));
