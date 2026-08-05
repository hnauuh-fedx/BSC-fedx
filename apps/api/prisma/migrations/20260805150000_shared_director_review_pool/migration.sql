-- A pending employee BSC review belongs to the shared DIRECTOR queue.
-- The actual reviewer is written only when a review decision wins its transaction.
ALTER TABLE "bsc_approval_steps"
ALTER COLUMN "approver_id" DROP NOT NULL;
