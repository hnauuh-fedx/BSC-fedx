CREATE TABLE "department_manager_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "department_id" UUID NOT NULL,
  "manager_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "assigned_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_manager_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_manager_assignments_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE,
  CONSTRAINT "department_manager_assignments_manager_fk" FOREIGN KEY ("manager_id") REFERENCES "users"("id"),
  CONSTRAINT "department_manager_assignments_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "users"("id"),
  CONSTRAINT "department_manager_assignments_dates_ck" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);
CREATE UNIQUE INDEX "department_manager_assignments_one_open_primary_uq"
  ON "department_manager_assignments"("department_id") WHERE "is_primary" = true AND "end_date" IS NULL;
CREATE INDEX "department_manager_assignments_active_idx" ON "department_manager_assignments"("department_id", "is_primary", "start_date", "end_date");
CREATE INDEX "department_manager_assignments_manager_idx" ON "department_manager_assignments"("manager_id", "is_primary", "start_date", "end_date");

INSERT INTO "department_manager_assignments" ("department_id", "manager_id", "start_date", "assigned_by")
SELECT DISTINCT ON (u."department_id") u."department_id", u."id", CURRENT_DATE, COALESCE(ur."assigned_by", u."id")
FROM "users" u
JOIN "user_roles" ur ON ur."user_id" = u."id"
JOIN "roles" r ON r."id" = ur."role_id" AND r."code" = 'MANAGER' AND r."status" = 'ACTIVE'
WHERE u."status" = 'ACTIVE' AND u."deleted_at" IS NULL
  AND ur."scope_type" = 'DEPARTMENT' AND ur."scope_id" = u."department_id"
  AND (ur."expires_at" IS NULL OR ur."expires_at" > CURRENT_TIMESTAMP)
ORDER BY u."department_id", ur."assigned_at", u."id";

CREATE TABLE "department_bsc" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bsc_code" VARCHAR(50) NOT NULL,
  "cycle_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "responsible_manager_id" UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "source_bsc_id" UUID,
  "plan_status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "plan_submitted_at" TIMESTAMPTZ(6), "plan_approved_at" TIMESTAMPTZ(6), "plan_approved_by" UUID,
  "evaluation_status" VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  "evaluation_submitted_at" TIMESTAMPTZ(6), "evaluation_approved_at" TIMESTAMPTZ(6), "evaluation_approved_by" UUID,
  "total_score" DECIMAL(18,4) NOT NULL DEFAULT 0, "final_score" DECIMAL(18,4), "final_grade" VARCHAR(10),
  "manager_comment" TEXT, "director_comment" TEXT,
  "created_by" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_bsc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_code_uq" UNIQUE ("bsc_code"),
  CONSTRAINT "department_bsc_cycle_department_uq" UNIQUE ("cycle_id", "department_id"),
  CONSTRAINT "department_bsc_cycle_fk" FOREIGN KEY ("cycle_id") REFERENCES "bsc_cycles"("id"),
  CONSTRAINT "department_bsc_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id"),
  CONSTRAINT "department_bsc_manager_fk" FOREIGN KEY ("responsible_manager_id") REFERENCES "users"("id"),
  CONSTRAINT "department_bsc_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id"),
  CONSTRAINT "department_bsc_source_fk" FOREIGN KEY ("source_bsc_id") REFERENCES "department_bsc"("id"),
  CONSTRAINT "department_bsc_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "department_bsc_plan_status_ck" CHECK ("plan_status" IN ('DRAFT','SUBMITTED','RETURNED','APPROVED','REOPENED')),
  CONSTRAINT "department_bsc_evaluation_status_ck" CHECK ("evaluation_status" IN ('NOT_STARTED','DRAFT','SUBMITTED','RETURNED','APPROVED','REOPENED'))
);
CREATE INDEX "department_bsc_plan_status_idx" ON "department_bsc"("plan_status");
CREATE INDEX "department_bsc_evaluation_status_idx" ON "department_bsc"("evaluation_status");
CREATE INDEX "department_bsc_manager_idx" ON "department_bsc"("responsible_manager_id");
CREATE INDEX "department_bsc_reviewer_idx" ON "department_bsc"("reviewer_id");

CREATE TABLE "department_bsc_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "department_bsc_id" UUID NOT NULL,
  "kpi_code" VARCHAR(50) NOT NULL, "kpi_name" VARCHAR(500) NOT NULL, "description" TEXT,
  "goal_group_code" VARCHAR(50) NOT NULL DEFAULT 'UNIT_PROFESSIONAL', "measurement_unit" VARCHAR(50) NOT NULL DEFAULT '%',
  "measurement_frequency" VARCHAR(100) NOT NULL DEFAULT 'Tháng', "target_value" DECIMAL(18,4), "target_text" TEXT,
  "actual_value" DECIMAL(18,4), "actual_text" TEXT, "weight" DECIMAL(5,2) NOT NULL,
  "achievement_percent" DECIMAL(18,4) NOT NULL DEFAULT 0, "weighted_score" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "calculation_method" VARCHAR(50) NOT NULL DEFAULT 'ACTUAL_DIV_TARGET', "manager_note" TEXT, "director_note" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0, "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_bsc_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_items_code_uq" UNIQUE ("department_bsc_id", "kpi_code"),
  CONSTRAINT "department_bsc_items_bsc_fk" FOREIGN KEY ("department_bsc_id") REFERENCES "department_bsc"("id") ON DELETE CASCADE,
  CONSTRAINT "department_bsc_items_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "department_bsc_items_weight_ck" CHECK ("weight" >= 0 AND "weight" <= 100),
  CONSTRAINT "department_bsc_items_method_ck" CHECK ("calculation_method" IN ('ACTUAL_DIV_TARGET','TARGET_DIV_ACTUAL','BINARY'))
);
CREATE INDEX "department_bsc_items_group_sort_idx" ON "department_bsc_items"("department_bsc_id", "goal_group_code", "sort_order");

CREATE TABLE "department_bsc_approval_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "department_bsc_id" UUID NOT NULL, "stage" VARCHAR(20) NOT NULL,
  "approver_id" UUID NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "comment" TEXT,
  "acted_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_bsc_approval_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_approval_steps_stage_uq" UNIQUE ("department_bsc_id", "stage"),
  CONSTRAINT "department_bsc_approval_steps_bsc_fk" FOREIGN KEY ("department_bsc_id") REFERENCES "department_bsc"("id") ON DELETE CASCADE,
  CONSTRAINT "department_bsc_approval_steps_approver_fk" FOREIGN KEY ("approver_id") REFERENCES "users"("id")
);
CREATE TABLE "department_bsc_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "department_bsc_id" UUID NOT NULL, "reviewer_id" UUID NOT NULL,
  "stage" VARCHAR(20) NOT NULL, "action" VARCHAR(30) NOT NULL, "score_before" DECIMAL(18,4), "score_after" DECIMAL(18,4),
  "comment" TEXT, "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_bsc_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_reviews_bsc_fk" FOREIGN KEY ("department_bsc_id") REFERENCES "department_bsc"("id") ON DELETE CASCADE,
  CONSTRAINT "department_bsc_reviews_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
);
CREATE INDEX "department_bsc_reviews_stage_idx" ON "department_bsc_reviews"("department_bsc_id", "stage", "reviewed_at");
CREATE TABLE "department_bsc_status_histories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "department_bsc_id" UUID NOT NULL, "stage" VARCHAR(20) NOT NULL,
  "from_status" VARCHAR(30), "to_status" VARCHAR(30) NOT NULL, "action" VARCHAR(50) NOT NULL, "comment" TEXT,
  "changed_by" UUID NOT NULL, "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" VARCHAR(50), "user_agent" TEXT,
  CONSTRAINT "department_bsc_status_histories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_histories_bsc_fk" FOREIGN KEY ("department_bsc_id") REFERENCES "department_bsc"("id") ON DELETE CASCADE,
  CONSTRAINT "department_bsc_histories_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "users"("id")
);
CREATE INDEX "department_bsc_histories_stage_idx" ON "department_bsc_status_histories"("department_bsc_id", "stage", "changed_at");
CREATE TABLE "department_bsc_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "department_bsc_id" UUID NOT NULL, "version_number" INTEGER NOT NULL,
  "stage" VARCHAR(20) NOT NULL, "version_type" VARCHAR(40) NOT NULL, "snapshot" JSONB NOT NULL,
  "created_by" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_bsc_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_versions_number_uq" UNIQUE ("department_bsc_id", "version_number"),
  CONSTRAINT "department_bsc_versions_bsc_fk" FOREIGN KEY ("department_bsc_id") REFERENCES "department_bsc"("id") ON DELETE CASCADE,
  CONSTRAINT "department_bsc_versions_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);
CREATE INDEX "department_bsc_versions_stage_idx" ON "department_bsc_versions"("department_bsc_id", "stage", "version_type");
CREATE TABLE "department_bsc_unlock_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "department_bsc_id" UUID NOT NULL, "stage" VARCHAR(20) NOT NULL,
  "requested_by" UUID NOT NULL, "reviewer_id" UUID NOT NULL, "request_reason" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "reviewed_by" UUID, "review_reason" TEXT,
  "reviewed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_bsc_unlock_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_bsc_unlock_requests_bsc_fk" FOREIGN KEY ("department_bsc_id") REFERENCES "department_bsc"("id") ON DELETE CASCADE,
  CONSTRAINT "department_bsc_unlock_requests_requester_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id"),
  CONSTRAINT "department_bsc_unlock_requests_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
);
CREATE UNIQUE INDEX "department_bsc_unlock_one_pending_uq" ON "department_bsc_unlock_requests"("department_bsc_id", "stage") WHERE "status" = 'PENDING';
CREATE INDEX "department_bsc_unlock_reviewer_idx" ON "department_bsc_unlock_requests"("reviewer_id", "status", "created_at");
CREATE INDEX "department_bsc_unlock_bsc_stage_idx" ON "department_bsc_unlock_requests"("department_bsc_id", "stage", "status");

INSERT INTO "permissions" ("code", "name", "module") VALUES
  ('bsc.department.create', 'Tạo BSC phòng ban', 'bsc'),
  ('bsc.department.view', 'Xem BSC phòng ban', 'bsc'),
  ('bsc.department.edit', 'Sửa BSC phòng ban', 'bsc'),
  ('bsc.department.delete.draft', 'Xóa nháp BSC phòng ban', 'bsc'),
  ('bsc.department.duplicate', 'Nhân bản BSC phòng ban', 'bsc'),
  ('bsc.department.plan.submit', 'Nộp kế hoạch BSC phòng ban', 'bsc'),
  ('bsc.department.plan.approve', 'Duyệt kế hoạch BSC phòng ban', 'bsc'),
  ('bsc.department.plan.return', 'Trả lại kế hoạch BSC phòng ban', 'bsc'),
  ('bsc.department.evaluation.submit', 'Nộp đánh giá BSC phòng ban', 'bsc'),
  ('bsc.department.evaluation.approve', 'Duyệt đánh giá BSC phòng ban', 'bsc'),
  ('bsc.department.evaluation.return', 'Trả lại đánh giá BSC phòng ban', 'bsc'),
  ('bsc.department.reopen.request', 'Yêu cầu mở lại BSC phòng ban', 'bsc'),
  ('bsc.department.reopen.review', 'Xử lý mở lại BSC phòng ban', 'bsc'),
  ('bsc.department.version.view', 'Xem phiên bản BSC phòng ban', 'bsc'),
  ('bsc.department.report.export', 'Xuất BSC phòng ban', 'bsc')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."code" IN (
  'bsc.department.create','bsc.department.view','bsc.department.edit','bsc.department.delete.draft',
  'bsc.department.duplicate','bsc.department.plan.submit','bsc.department.evaluation.submit',
  'bsc.department.reopen.request','bsc.department.version.view','bsc.department.report.export')
WHERE r."code" = 'MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."code" IN (
  'bsc.department.view','bsc.department.plan.approve','bsc.department.plan.return',
  'bsc.department.evaluation.approve','bsc.department.evaluation.return','bsc.department.reopen.review',
  'bsc.department.version.view','bsc.department.report.export')
WHERE r."code" = 'DIRECTOR'
ON CONFLICT DO NOTHING;
