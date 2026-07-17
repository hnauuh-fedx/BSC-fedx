-- Position level is organizational display order only. It never grants a role,
-- permission, BSC approval authority, or a direct-manager relationship.
ALTER TABLE "positions" DROP CONSTRAINT IF EXISTS "positions_level_ck";
ALTER TABLE "positions"
  ADD CONSTRAINT "positions_level_ck" CHECK (level >= 1 AND level <= 999) NOT VALID;

-- Existing out-of-range rows are preserved for an explicit data-owner decision.
-- PostgreSQL still enforces the NOT VALID constraint for all new/updated rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "positions" WHERE level < 1 OR level > 999) THEN
    ALTER TABLE "positions" VALIDATE CONSTRAINT "positions_level_ck";
  END IF;
END $$;
