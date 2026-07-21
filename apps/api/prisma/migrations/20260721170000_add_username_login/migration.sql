ALTER TABLE "users" ADD COLUMN "username" VARCHAR(50);

DO $$
DECLARE
  account RECORD;
  base_username TEXT;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR account IN SELECT "id", "employee_code" FROM "users" ORDER BY "id" LOOP
    base_username := TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(account."employee_code"), '[^a-z0-9._-]+', '_', 'g'));
    IF LENGTH(base_username) < 3 THEN
      base_username := 'user_' || SUBSTRING(REPLACE(account."id"::text, '-', ''), 1, 8);
    END IF;

    candidate := LEFT(base_username, 50);
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM "users" WHERE "username" = candidate) LOOP
      candidate := LEFT(base_username, 50 - LENGTH(suffix::text) - 1) || '_' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE "users" SET "username" = candidate WHERE "id" = account."id";
  END LOOP;
END $$;

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
