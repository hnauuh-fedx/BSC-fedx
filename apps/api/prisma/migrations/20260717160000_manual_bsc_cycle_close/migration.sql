-- A BSC cycle now remains open until an administrator explicitly closes it.
-- Existing planned dates are preserved for historical records; new cycles leave
-- both values NULL and set end_date to the actual Vietnam business date on close.
ALTER TABLE "bsc_cycles"
  ALTER COLUMN "end_date" DROP NOT NULL,
  ALTER COLUMN "submission_deadline" DROP NOT NULL;
