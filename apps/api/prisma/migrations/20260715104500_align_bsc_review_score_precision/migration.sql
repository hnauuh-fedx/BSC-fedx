-- Keep review snapshots at the same precision as official BSC totals.
-- This only widens numeric precision; it does not recalculate existing scores.
ALTER TABLE "bsc_reviews"
  ALTER COLUMN "score_before" TYPE DECIMAL(18,4),
  ALTER COLUMN "score_after" TYPE DECIMAL(18,4);
