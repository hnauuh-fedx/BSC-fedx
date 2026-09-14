ALTER TABLE "department_bsc_unlock_requests"
ADD COLUMN "request_source" VARCHAR(30) NOT NULL DEFAULT 'OWNER_REQUEST';

ALTER TABLE "department_bsc_unlock_requests"
ADD CONSTRAINT "department_bsc_unlock_requests_source_check"
CHECK ("request_source" IN ('OWNER_REQUEST', 'DIRECTOR_RESET'));

INSERT INTO "permissions" ("code", "name", "module")
VALUES ('bsc.department.reset.approved', 'Mở lại trực tiếp BSC phòng ban đã duyệt', 'bsc')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'bsc.department.reset.approved'
WHERE r."code" = 'DIRECTOR'
ON CONFLICT DO NOTHING;
