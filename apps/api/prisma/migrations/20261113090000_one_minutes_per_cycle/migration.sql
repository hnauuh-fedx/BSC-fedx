BEGIN;

ALTER TABLE "bsc_minutes" ADD COLUMN "archived_at" TIMESTAMPTZ(6);

-- Preserve all old records, snapshots, events and audit references. The latest
-- edited record wins; created_at/id make ties deterministic.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "cycle_id" ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
  ) AS rank
  FROM "bsc_minutes"
)
UPDATE "bsc_minutes" AS minutes
SET "archived_at" = CURRENT_TIMESTAMP
FROM ranked
WHERE minutes."id" = ranked."id" AND ranked.rank > 1;

CREATE UNIQUE INDEX "bsc_minutes_active_cycle_key"
ON "bsc_minutes" ("cycle_id") WHERE "archived_at" IS NULL;

COMMIT;
