ALTER TABLE "bsc_cycles"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "bsc_cycles" DROP CONSTRAINT "bsc_cycles_status_ck";
ALTER TABLE "bsc_cycles"
  ADD CONSTRAINT "bsc_cycles_status_ck"
  CHECK ("status" IN ('DRAFT', 'OPEN', 'LOCKED', 'CLOSED'));

CREATE INDEX "bsc_cycles_status_start_idx"
  ON "bsc_cycles" ("status", "start_date", "id");
