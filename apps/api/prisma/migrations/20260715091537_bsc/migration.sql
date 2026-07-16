-- DropIndex
-- Legacy databases may already have removed this standalone unique index
-- while applying the dual-stage workflow repair.
DROP INDEX IF EXISTS "bsc_approval_steps_order_uq";

-- DropIndex
DROP INDEX "bsc_status_histories_bsc_stage_idx";
