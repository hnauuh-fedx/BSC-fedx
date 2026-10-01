CREATE SEQUENCE "users_employee_code_seq";
CREATE SEQUENCE "departments_code_seq";
CREATE SEQUENCE "bsc_cycles_code_seq";

SELECT setval(
  'users_employee_code_seq',
  COALESCE(MAX(substring("employee_code" FROM '^NV([0-9]+)$')::bigint), 0) + 1,
  false
)
FROM "users";

SELECT setval(
  'departments_code_seq',
  COALESCE(MAX(substring("code" FROM '^DV([0-9]+)$')::bigint), 0) + 1,
  false
)
FROM "departments";

SELECT setval(
  'bsc_cycles_code_seq',
  COALESCE(MAX(substring("code" FROM '^KY([0-9]+)$')::bigint), 0) + 1,
  false
)
FROM "bsc_cycles";
