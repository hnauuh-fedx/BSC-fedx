-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "module" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" VARCHAR(50),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_approval_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_bsc_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_id" UUID NOT NULL,
    "approver_role" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "acted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_bsc_id" UUID NOT NULL,
    "bsc_item_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bsc_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "cycle_type" VARCHAR(20) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "submission_deadline" TIMESTAMPTZ(6) NOT NULL,
    "review_deadline" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_grade_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grade_code" VARCHAR(10) NOT NULL,
    "grade_name" VARCHAR(100) NOT NULL,
    "min_score" DECIMAL(7,2) NOT NULL,
    "max_score" DECIMAL(7,2),
    "sort_order" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_grade_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_bsc_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "reviewer_role" VARCHAR(30) NOT NULL,
    "review_level" INTEGER NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "score_before" DECIMAL(7,2),
    "score_after" DECIMAL(7,2),
    "comment" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_status_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_bsc_id" UUID NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "comment" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(50),
    "user_agent" TEXT,

    CONSTRAINT "bsc_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_template_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "measurement_unit" VARCHAR(50),
    "target_type" VARCHAR(30) NOT NULL,
    "default_target" DECIMAL(18,4),
    "default_target_text" TEXT,
    "default_weight" DECIMAL(5,2) NOT NULL,
    "calculation_method" VARCHAR(50) NOT NULL DEFAULT 'ACTUAL_DIV_TARGET',
    "max_score_percent" DECIMAL(7,2),
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bsc_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_template_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_template_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "department_id" UUID,
    "position_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bsc_unlock_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_bsc_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "request_reason" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "unlock_until" TIMESTAMPTZ(6),
    "allowed_fields" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bsc_unlock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bsc" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bsc_code" VARCHAR(50) NOT NULL,
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "direct_manager_id" UUID NOT NULL,
    "template_id" UUID,
    "template_version" INTEGER,
    "source_bsc_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "employee_total_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "manager_total_score" DECIMAL(7,2),
    "final_score" DECIMAL(7,2),
    "final_grade" VARCHAR(10),
    "employee_comment" TEXT,
    "manager_comment" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_bsc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bsc_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_bsc_id" UUID NOT NULL,
    "template_item_id" UUID,
    "section_id" UUID,
    "kpi_code" VARCHAR(50) NOT NULL,
    "kpi_name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "measurement_unit" VARCHAR(50),
    "target_value" DECIMAL(18,4),
    "target_text" TEXT,
    "actual_value" DECIMAL(18,4),
    "actual_text" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "achievement_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "employee_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "manager_score" DECIMAL(7,2),
    "final_score" DECIMAL(7,2),
    "calculation_method" VARCHAR(50) NOT NULL DEFAULT 'ACTUAL_DIV_TARGET',
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employee_note" TEXT,
    "manager_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_bsc_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_relationships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "hierarchy_level" INTEGER NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "direct_manager_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bsc_approval_steps_order_uq" ON "bsc_approval_steps"("employee_bsc_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "bsc_cycles_code_key" ON "bsc_cycles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bsc_grade_rules_code_from_uq" ON "bsc_grade_rules"("grade_code", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "bsc_template_items_code_uq" ON "bsc_template_items"("section_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "bsc_template_sections_code_uq" ON "bsc_template_sections"("template_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "bsc_templates_code_version_uq" ON "bsc_templates"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bsc_bsc_code_key" ON "employee_bsc"("bsc_code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bsc_cycle_employee_uq" ON "employee_bsc"("cycle_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bsc_items_code_uq" ON "employee_bsc_items"("employee_bsc_id", "kpi_code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_department_idx" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "users_direct_manager_idx" ON "users"("direct_manager_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_approval_steps" ADD CONSTRAINT "bsc_approval_steps_approver_fk" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_approval_steps" ADD CONSTRAINT "bsc_approval_steps_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_attachments" ADD CONSTRAINT "bsc_attachments_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_attachments" ADD CONSTRAINT "bsc_attachments_item_fk" FOREIGN KEY ("bsc_item_id") REFERENCES "employee_bsc_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_attachments" ADD CONSTRAINT "bsc_attachments_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_cycles" ADD CONSTRAINT "bsc_cycles_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_grade_rules" ADD CONSTRAINT "bsc_grade_rules_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_reviews" ADD CONSTRAINT "bsc_reviews_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_reviews" ADD CONSTRAINT "bsc_reviews_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_status_histories" ADD CONSTRAINT "bsc_status_histories_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_status_histories" ADD CONSTRAINT "bsc_status_histories_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_template_items" ADD CONSTRAINT "bsc_template_items_section_fk" FOREIGN KEY ("section_id") REFERENCES "bsc_template_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_template_sections" ADD CONSTRAINT "bsc_template_sections_template_fk" FOREIGN KEY ("template_id") REFERENCES "bsc_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_templates" ADD CONSTRAINT "bsc_templates_approved_by_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_templates" ADD CONSTRAINT "bsc_templates_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_templates" ADD CONSTRAINT "bsc_templates_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_templates" ADD CONSTRAINT "bsc_templates_position_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_requested_by_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_reviewed_by_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_approved_by_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_cycle_fk" FOREIGN KEY ("cycle_id") REFERENCES "bsc_cycles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_manager_fk" FOREIGN KEY ("direct_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_position_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_source_fk" FOREIGN KEY ("source_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_template_fk" FOREIGN KEY ("template_id") REFERENCES "bsc_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc_items" ADD CONSTRAINT "employee_bsc_items_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc_items" ADD CONSTRAINT "employee_bsc_items_bsc_fk" FOREIGN KEY ("employee_bsc_id") REFERENCES "employee_bsc"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc_items" ADD CONSTRAINT "employee_bsc_items_section_fk" FOREIGN KEY ("section_id") REFERENCES "bsc_template_sections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bsc_items" ADD CONSTRAINT "employee_bsc_items_template_item_fk" FOREIGN KEY ("template_item_id") REFERENCES "bsc_template_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "manager_relationships" ADD CONSTRAINT "manager_relationships_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "manager_relationships" ADD CONSTRAINT "manager_relationships_manager_fk" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_direct_manager_fk" FOREIGN KEY ("direct_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_position_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Preserve PostgreSQL CHECK constraints omitted by Prisma schema introspection.
ALTER TABLE "bsc_approval_steps" ADD CONSTRAINT "bsc_approval_steps_role_ck" CHECK (((approver_role)::text = ANY ((ARRAY['MANAGER'::character varying, 'DIRECTOR'::character varying])::text[])));
ALTER TABLE "bsc_approval_steps" ADD CONSTRAINT "bsc_approval_steps_status_ck" CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'RETURNED'::character varying, 'SKIPPED'::character varying])::text[])));
ALTER TABLE "bsc_cycles" ADD CONSTRAINT "bsc_cycles_date_ck" CHECK ((end_date >= start_date));
ALTER TABLE "bsc_cycles" ADD CONSTRAINT "bsc_cycles_month_ck" CHECK (((month IS NULL) OR ((month >= 1) AND (month <= 12))));
ALTER TABLE "bsc_cycles" ADD CONSTRAINT "bsc_cycles_quarter_ck" CHECK (((quarter IS NULL) OR ((quarter >= 1) AND (quarter <= 4))));
ALTER TABLE "bsc_cycles" ADD CONSTRAINT "bsc_cycles_status_ck" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'OPEN'::character varying, 'CLOSED'::character varying])::text[])));
ALTER TABLE "bsc_cycles" ADD CONSTRAINT "bsc_cycles_type_ck" CHECK (((cycle_type)::text = ANY ((ARRAY['MONTH'::character varying, 'QUARTER'::character varying, 'YEAR'::character varying])::text[])));
ALTER TABLE "bsc_grade_rules" ADD CONSTRAINT "bsc_grade_rules_score_ck" CHECK (((min_score >= (0)::numeric) AND ((max_score IS NULL) OR (max_score >= min_score))));
ALTER TABLE "bsc_grade_rules" ADD CONSTRAINT "bsc_grade_rules_status_ck" CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])));
ALTER TABLE "bsc_reviews" ADD CONSTRAINT "bsc_reviews_action_ck" CHECK (((action)::text = ANY ((ARRAY['REVIEW'::character varying, 'RETURN'::character varying, 'APPROVE'::character varying, 'REJECT'::character varying])::text[])));
ALTER TABLE "bsc_reviews" ADD CONSTRAINT "bsc_reviews_role_ck" CHECK (((reviewer_role)::text = ANY ((ARRAY['MANAGER'::character varying, 'DIRECTOR'::character varying])::text[])));
ALTER TABLE "bsc_template_items" ADD CONSTRAINT "bsc_template_items_target_type_ck" CHECK (((target_type)::text = ANY ((ARRAY['NUMBER'::character varying, 'PERCENT'::character varying, 'TEXT'::character varying, 'BOOLEAN'::character varying])::text[])));
ALTER TABLE "bsc_template_items" ADD CONSTRAINT "bsc_template_items_weight_ck" CHECK (((default_weight >= (0)::numeric) AND (default_weight <= (100)::numeric)));
ALTER TABLE "bsc_template_sections" ADD CONSTRAINT "bsc_template_sections_weight_ck" CHECK (((weight >= (0)::numeric) AND (weight <= (100)::numeric)));
ALTER TABLE "bsc_templates" ADD CONSTRAINT "bsc_templates_status_ck" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])));
ALTER TABLE "bsc_unlock_requests" ADD CONSTRAINT "bsc_unlock_requests_status_ck" CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'EXPIRED'::character varying])::text[])));
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_not_self_ck" CHECK (((parent_id IS NULL) OR (parent_id <> id)));
ALTER TABLE "departments" ADD CONSTRAINT "departments_status_ck" CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])));
ALTER TABLE "employee_bsc" ADD CONSTRAINT "employee_bsc_status_ck" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'SUBMITTED'::character varying, 'UNDER_REVIEW'::character varying, 'RETURNED'::character varying, 'RESUBMITTED'::character varying, 'APPROVED'::character varying, 'UNLOCK_REQUESTED'::character varying, 'UNLOCKED'::character varying, 'CANCELLED'::character varying, 'CLOSED'::character varying])::text[])));
ALTER TABLE "employee_bsc_items" ADD CONSTRAINT "employee_bsc_items_weight_ck" CHECK (((weight >= (0)::numeric) AND (weight <= (100)::numeric)));
ALTER TABLE "manager_relationships" ADD CONSTRAINT "manager_relationships_date_ck" CHECK (((end_date IS NULL) OR (end_date >= start_date)));
ALTER TABLE "manager_relationships" ADD CONSTRAINT "manager_relationships_not_self_ck" CHECK ((employee_id <> manager_id));
ALTER TABLE "positions" ADD CONSTRAINT "positions_level_ck" CHECK ((level > 0));
ALTER TABLE "positions" ADD CONSTRAINT "positions_status_ck" CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])));
ALTER TABLE "roles" ADD CONSTRAINT "roles_level_ck" CHECK ((hierarchy_level > 0));
ALTER TABLE "roles" ADD CONSTRAINT "roles_status_ck" CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])));
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_ck" CHECK (((((scope_type)::text = ANY ((ARRAY['GLOBAL'::character varying, 'SELF'::character varying])::text[])) AND (scope_id IS NULL)) OR (((scope_type)::text = 'DEPARTMENT'::text) AND (scope_id IS NOT NULL))));
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_type_ck" CHECK (((scope_type)::text = ANY ((ARRAY['GLOBAL'::character varying, 'DEPARTMENT'::character varying, 'SELF'::character varying])::text[])));
ALTER TABLE "users" ADD CONSTRAINT "users_manager_not_self_ck" CHECK (((direct_manager_id IS NULL) OR (direct_manager_id <> id)));
ALTER TABLE "users" ADD CONSTRAINT "users_status_ck" CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'LOCKED'::character varying])::text[])));
