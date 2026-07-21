DELETE FROM "role_permissions" AS rp
USING "roles" AS r, "permissions" AS p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."code" = 'MANAGER'
  AND p."code" IN (
    'bsc.kpi.manage.subordinate',
    'bsc.plan.approve.subordinate',
    'bsc.plan.return.subordinate',
    'bsc.evaluation.approve.subordinate',
    'bsc.evaluation.return.subordinate',
    'bsc.reopen.subordinate'
  );
