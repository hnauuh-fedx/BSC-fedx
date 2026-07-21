-- Directors can monitor Manager and Employee BSCs across the organization.
-- Review authority remains constrained by the active manager relationship.
UPDATE "user_roles" AS ur
SET "scope_type" = 'GLOBAL',
    "scope_id" = NULL
FROM "roles" AS r
WHERE ur."role_id" = r."id"
  AND r."code" = 'DIRECTOR'
  AND (ur."scope_type" <> 'GLOBAL' OR ur."scope_id" IS NOT NULL);
