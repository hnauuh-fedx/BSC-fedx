INSERT INTO "permissions" ("id", "code", "name", "module", "description")
VALUES
  (gen_random_uuid(), 'bsc.minutes.create', 'Tạo biên bản đánh giá BSC', 'bsc', 'Tạo và in biên bản họp đánh giá BSC trong phạm vi được giao.'),
  (gen_random_uuid(), 'bsc.minutes.view', 'Xem biên bản đánh giá BSC', 'bsc', 'Xem biên bản họp đánh giá BSC trong phạm vi được giao.')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "module" = EXCLUDED."module",
    "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."code" = 'DIRECTOR'
  AND p."code" IN ('bsc.minutes.create', 'bsc.minutes.view')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
