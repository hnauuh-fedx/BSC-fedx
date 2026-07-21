-- All BSC KPIs use the higher-is-better calculation method.
UPDATE "employee_bsc_items"
SET "calculation_method" = 'ACTUAL_DIV_TARGET';

ALTER TABLE "employee_bsc_items"
  ALTER COLUMN "calculation_method" SET DEFAULT 'ACTUAL_DIV_TARGET';

ALTER TABLE "employee_bsc_items"
  ADD CONSTRAINT "employee_bsc_items_calculation_method_ck"
    CHECK ("calculation_method" = 'ACTUAL_DIV_TARGET');
