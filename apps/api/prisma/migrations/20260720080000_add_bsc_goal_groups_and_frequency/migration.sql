-- Persist the fixed BSC objective-group assignment and optional measurement frequency.
-- Existing items remain valid and are shown in the first group until explicitly reassigned.
ALTER TABLE "employee_bsc_items"
  ADD COLUMN "goal_group_code" VARCHAR(50),
  ADD COLUMN "measurement_frequency" VARCHAR(100);

ALTER TABLE "employee_bsc_items"
  ADD CONSTRAINT "employee_bsc_items_goal_group_ck"
  CHECK (
    "goal_group_code" IS NULL OR "goal_group_code" IN (
      'COMMON',
      'UNIT_PROFESSIONAL',
      'IMPORTANT_URGENT',
      'IMPORTANT_OR_URGENT',
      'ROUTINE'
    )
  );

CREATE INDEX "employee_bsc_items_group_sort_idx"
  ON "employee_bsc_items" ("employee_bsc_id", "goal_group_code", "sort_order");
