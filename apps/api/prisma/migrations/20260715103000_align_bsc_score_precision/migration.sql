-- Preserve the canonical weighted total used for classification.
-- This only widens numeric precision; it does not recalculate existing scores.
ALTER TABLE "employee_bsc"
  ALTER COLUMN "employee_total_score" TYPE DECIMAL(18,4),
  ALTER COLUMN "manager_total_score" TYPE DECIMAL(18,4),
  ALTER COLUMN "final_score" TYPE DECIMAL(18,4);
