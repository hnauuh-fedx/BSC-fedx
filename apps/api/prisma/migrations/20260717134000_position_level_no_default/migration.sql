-- Organizational rank must be explicitly supplied when a position is created.
ALTER TABLE "positions" ALTER COLUMN "level" DROP DEFAULT;

DO $$
DECLARE referenced_users integer;
BEGIN
  SELECT COUNT(*) INTO referenced_users
  FROM "users" AS app_user
  JOIN "positions" AS position ON position.id = app_user.position_id
  WHERE UPPER(BTRIM(position.code)) = 'ADMIN';
  RAISE NOTICE 'Legacy ADMIN position referenced users: %', referenced_users;
END $$;
