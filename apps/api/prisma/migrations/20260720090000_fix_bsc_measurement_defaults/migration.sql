-- BSC KPIs use one organization-wide measurement unit and cadence.
UPDATE "employee_bsc_items"
SET
  "measurement_unit" = '%',
  "measurement_frequency" = 'Tháng';

ALTER TABLE "employee_bsc_items"
  ALTER COLUMN "measurement_unit" SET DEFAULT '%',
  ALTER COLUMN "measurement_unit" SET NOT NULL,
  ALTER COLUMN "measurement_frequency" SET DEFAULT 'Tháng',
  ALTER COLUMN "measurement_frequency" SET NOT NULL;

ALTER TABLE "employee_bsc_items"
  ADD CONSTRAINT "employee_bsc_items_measurement_unit_ck"
    CHECK ("measurement_unit" = '%'),
  ADD CONSTRAINT "employee_bsc_items_measurement_frequency_ck"
    CHECK ("measurement_frequency" = 'Tháng');
