CREATE TABLE "bsc_minutes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cycle_id" UUID NOT NULL,
  "minutes_number" VARCHAR(50) NOT NULL,
  "issue_place" VARCHAR(255) NOT NULL,
  "meeting_date" DATE NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "meeting_location" VARCHAR(500) NOT NULL,
  "chair_name" VARCHAR(255) NOT NULL,
  "secretary_name" VARCHAR(255) NOT NULL,
  "absent_count" INTEGER NOT NULL DEFAULT 0,
  "subject" TEXT NOT NULL,
  "meeting_content" TEXT NOT NULL,
  "next_month_assignment" TEXT NOT NULL,
  "conclusion" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "print_count" INTEGER NOT NULL DEFAULT 0,
  "pdf_export_count" INTEGER NOT NULL DEFAULT 0,
  "last_printed_at" TIMESTAMPTZ(6),
  "last_pdf_exported_at" TIMESTAMPTZ(6),
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bsc_minutes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bsc_minutes_absent_count_check" CHECK ("absent_count" >= 0),
  CONSTRAINT "bsc_minutes_version_check" CHECK ("version" > 0)
);

CREATE TABLE "bsc_minutes_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "minutes_id" UUID NOT NULL,
  "action" VARCHAR(30) NOT NULL,
  "actor_id" UUID NOT NULL,
  "ip_address" VARCHAR(50),
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bsc_minutes_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bsc_minutes_events_action_check" CHECK ("action" IN ('PRINT_REQUESTED', 'PDF_EXPORTED'))
);

CREATE INDEX "bsc_minutes_cycle_updated_idx" ON "bsc_minutes"("cycle_id", "updated_at");
CREATE INDEX "bsc_minutes_created_by_idx" ON "bsc_minutes"("created_by");
CREATE INDEX "bsc_minutes_events_minutes_created_idx" ON "bsc_minutes_events"("minutes_id", "created_at");
ALTER TABLE "bsc_minutes" ADD CONSTRAINT "bsc_minutes_cycle_fk" FOREIGN KEY ("cycle_id") REFERENCES "bsc_cycles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "bsc_minutes" ADD CONSTRAINT "bsc_minutes_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "bsc_minutes" ADD CONSTRAINT "bsc_minutes_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "bsc_minutes_events" ADD CONSTRAINT "bsc_minutes_events_minutes_fk" FOREIGN KEY ("minutes_id") REFERENCES "bsc_minutes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "bsc_minutes_events" ADD CONSTRAINT "bsc_minutes_events_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
