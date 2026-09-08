ALTER TABLE "bsc_approval_steps"
  ADD COLUMN "acted_by" UUID,
  ADD COLUMN "acted_as_role" VARCHAR(30),
  ADD COLUMN "decision_source" VARCHAR(30) NOT NULL DEFAULT 'PRIMARY_ROUTE';

UPDATE "bsc_approval_steps"
SET "acted_by" = "approver_id", "acted_as_role" = "approver_role"
WHERE "status" <> 'PENDING';

ALTER TABLE "bsc_approval_steps"
  ADD CONSTRAINT "bsc_approval_steps_acted_by_fk"
  FOREIGN KEY ("acted_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "bsc_approval_steps_decision_source_ck"
  CHECK ("decision_source" IN ('PRIMARY_ROUTE', 'DIRECTOR_OVERRIDE'));

ALTER TABLE "bsc_reviews"
  ADD COLUMN "decision_source" VARCHAR(30) NOT NULL DEFAULT 'PRIMARY_ROUTE',
  ADD CONSTRAINT "bsc_reviews_decision_source_ck"
  CHECK ("decision_source" IN ('PRIMARY_ROUTE', 'DIRECTOR_OVERRIDE'));

ALTER TABLE "bsc_unlock_requests"
  ADD COLUMN "decision_source" VARCHAR(30) NOT NULL DEFAULT 'PRIMARY_ROUTE',
  ADD CONSTRAINT "bsc_unlock_requests_decision_source_ck"
  CHECK ("decision_source" IN ('PRIMARY_ROUTE', 'DIRECTOR_OVERRIDE'));
