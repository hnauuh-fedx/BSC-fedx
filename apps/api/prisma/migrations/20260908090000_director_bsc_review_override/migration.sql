INSERT INTO "permissions" ("code", "name", "module", "description")
VALUES (
  'bsc.review.override',
  'Can thiệp duyệt BSC nhân viên',
  'bsc',
  'Cho phép DIRECTOR GLOBAL duyệt, trả lại hoặc mở lại BSC đang thuộc tuyến Trưởng phòng.'
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'DIRECTOR'
  AND p."code" = 'bsc.review.override'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
