-- A direct manager is organizational context only. Employee BSC approval is assigned to DIRECTOR.
ALTER TABLE "employee_bsc"
  ALTER COLUMN "direct_manager_id" DROP NOT NULL;
