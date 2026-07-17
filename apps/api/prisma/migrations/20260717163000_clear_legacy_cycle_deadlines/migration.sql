-- A cycle only has an end date after an administrator closes it.
-- Legacy deadlines and planned end dates must not affect active cycles.
UPDATE "bsc_cycles"
SET
  "submission_deadline" = NULL,
  "end_date" = CASE WHEN "status" = 'CLOSED' THEN "end_date" ELSE NULL END
WHERE "submission_deadline" IS NOT NULL
   OR ("status" <> 'CLOSED' AND "end_date" IS NOT NULL);
