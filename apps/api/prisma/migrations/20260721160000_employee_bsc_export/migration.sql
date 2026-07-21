-- Nhân viên được xuất BSC cá nhân trong phạm vi SELF.
INSERT INTO "permissions" ("id", "code", "name", "module", "description")
VALUES (
  gen_random_uuid(),
  'bsc.report.export',
  'Xuất báo cáo BSC',
  'bsc',
  'Xuất BSC theo permission và phạm vi dữ liệu được giao.'
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "module" = EXCLUDED."module",
    "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."code" = 'EMPLOYEE'
  AND p."code" = 'bsc.report.export'
ON CONFLICT DO NOTHING;
