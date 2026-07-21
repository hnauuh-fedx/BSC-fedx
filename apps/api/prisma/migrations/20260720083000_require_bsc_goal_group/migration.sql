-- Every KPI belongs to one of the fixed BSC goal groups.
-- Legacy ungrouped items are assigned to the first template row.
UPDATE "employee_bsc_items"
SET "goal_group_code" = 'COMMON'
WHERE "goal_group_code" IS NULL;

ALTER TABLE "employee_bsc_items"
  ALTER COLUMN "goal_group_code" SET DEFAULT 'COMMON',
  ALTER COLUMN "goal_group_code" SET NOT NULL;
