import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BscReviewerResolver } from '../src/modules/bsc-reviewers/bsc-reviewer-resolver';

const ownerId = '00000000-0000-4000-8000-000000000001';
const directorId = '00000000-0000-4000-8000-000000000002';
const departmentId = '00000000-0000-4000-8000-000000000010';
const departmentManagerId = '00000000-0000-4000-8000-000000000011';

function databaseWithDirectors(ids: string[]) {
  let capturedWhere: unknown;
  return {
    db: {
      users: {
        findMany: async (args: { where: unknown }) => {
          capturedWhere = args.where;
          return ids.map((id) => ({ id }));
        },
      },
    },
    where: () => capturedWhere,
  };
}

test('resolves every active global DIRECTOR with the stage permission', async () => {
  const fake = databaseWithDirectors([directorId]);
  const result = await new BscReviewerResolver().resolveRequiredDirectors(
    fake.db as never,
    { ownerId, permission: 'bsc.plan.approve.subordinate' },
  );

  assert.deepEqual(result, [{ id: directorId, role: 'DIRECTOR' }]);
  const where = fake.where() as any;
  assert.equal(where.id.not, ownerId);
  assert.equal(where.status, 'ACTIVE');
  assert.equal(where.user_roles_user_roles_user_idTousers.some.scope_type, 'GLOBAL');
  assert.equal(where.user_roles_user_roles_user_idTousers.some.scope_id, null);
  assert.ok(where.user_roles_user_roles_user_idTousers.some.OR[1].expires_at.gt instanceof Date);
  assert.equal(where.user_roles_user_roles_user_idTousers.some.roles.code, 'DIRECTOR');
  assert.deepEqual(
    where.user_roles_user_roles_user_idTousers.some.roles.role_permissions.some.permissions,
    { code: { in: ['bsc.plan.approve.subordinate'] } },
  );
});

test('fails without changing workflow when no active DIRECTOR is configured', async () => {
  const fake = databaseWithDirectors([]);
  await assert.rejects(
    new BscReviewerResolver().resolveRequiredDirectors(
      fake.db as never,
      { ownerId, permission: 'bsc.evaluation.approve.subordinate' },
    ),
    (error: any) => error.response.code === 'BSC_DIRECTOR_REVIEWER_REQUIRED',
  );
});

test('returns a shared reviewer pool when multiple DIRECTORs are eligible', async () => {
  const secondDirectorId = '00000000-0000-4000-8000-000000000003';
  const fake = databaseWithDirectors([directorId, secondDirectorId]);
  const result = await new BscReviewerResolver().resolveRequiredDirectors(
    fake.db as never,
    { ownerId, permission: 'bsc.plan.approve.subordinate' },
  );

  assert.deepEqual(result, [
    { id: directorId, role: 'DIRECTOR' },
    { id: secondDirectorId, role: 'DIRECTOR' },
  ]);
});

test('stage pool query accepts either approve or return permission', async () => {
  const fake = databaseWithDirectors([directorId]);
  await new BscReviewerResolver().resolveRequiredDirectors(fake.db as never, {
    ownerId,
    permission: ['bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate'],
  });

  const where = fake.where() as any;
  assert.deepEqual(
    where.user_roles_user_roles_user_idTousers.some.roles.role_permissions.some.permissions,
    { code: { in: ['bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate'] } },
  );
});

function databaseWithDepartmentRoute(input: { managerId: string; ownerIsManager?: boolean }) {
  return {
    employee_bsc_approval_routes: {
      findUnique: async () => ({ reviewer_type: 'DEPARTMENT_MANAGER' }),
    },
    department_manager_assignments: {
      findMany: async () => [{ manager_id: input.managerId }],
    },
    users: {
      findMany: async () => [{ id: directorId }],
    },
  };
}

test('routes configured department employee stages to the active department manager', async () => {
  const db = databaseWithDepartmentRoute({ managerId: departmentManagerId });
  const result = await new BscReviewerResolver().resolveRequiredReviewers(db as never, {
    ownerId,
    departmentId,
    stage: 'PLAN',
    permission: ['bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate'],
  });

  assert.deepEqual(result, [{ id: departmentManagerId, role: 'MANAGER' }]);
});

test('routes the department manager own BSC to the shared DIRECTOR pool', async () => {
  const db = databaseWithDepartmentRoute({ managerId: departmentManagerId });
  const result = await new BscReviewerResolver().resolveRequiredReviewers(db as never, {
    ownerId: departmentManagerId,
    departmentId,
    stage: 'EVALUATION',
    permission: 'bsc.evaluation.approve.subordinate',
  });

  assert.deepEqual(result, [{ id: directorId, role: 'DIRECTOR' }]);
});
