CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "target_path" VARCHAR(255) NOT NULL,
    "metadata" JSONB,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications"("recipient_id", "read_at", "created_at" DESC);
CREATE INDEX "notifications_recipient_feed_idx" ON "notifications"("recipient_id", "created_at" DESC, "id");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_recipient_fk"
FOREIGN KEY ("recipient_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_actor_fk"
FOREIGN KEY ("actor_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
