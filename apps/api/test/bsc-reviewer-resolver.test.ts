import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BscReviewerResolver } from '../src/modules/bsc-reviewers/bsc-reviewer-resolver';

const ownerId = '00000000-0000-4000-8000-000000000001';
const directorId = '00000000-0000-4000-8000-000000000002';

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

test('resolves the single active global DIRECTOR with the stage permission', async () => {
  const fake = databaseWithDirectors([directorId]);
  const result = await new BscReviewerResolver().resolveRequiredDirector(
    fake.db as never,
    { ownerId, permission: 'bsc.plan.approve.subordinate' },
  );

  assert.deepEqual(result, { id: directorId, role: 'DIRECTOR' });
  const where = fake.where() as any;
  assert.equal(where.id.not, ownerId);
  assert.equal(where.status, 'ACTIVE');
  assert.equal(where.user_roles_user_roles_user_idTousers.some.scope_type, 'GLOBAL');
  assert.equal(where.user_roles_user_roles_user_idTousers.some.scope_id, null);
  assert.ok(where.user_roles_user_roles_user_idTousers.some.OR[1].expires_at.gt instanceof Date);
  assert.equal(where.user_roles_user_roles_user_idTousers.some.roles.code, 'DIRECTOR');
  assert.equal(
    where.user_roles_user_roles_user_idTousers.some.roles.role_permissions.some.permissions.code,
    'bsc.plan.approve.subordinate',
  );
});

test('fails without changing workflow when no active DIRECTOR is configured', async () => {
  const fake = databaseWithDirectors([]);
  await assert.rejects(
    new BscReviewerResolver().resolveRequiredDirector(
      fake.db as never,
      { ownerId, permission: 'bsc.evaluation.approve.subordinate' },
    ),
    (error: any) => error.response.code === 'BSC_DIRECTOR_REVIEWER_REQUIRED',
  );
});

test('does not choose an arbitrary reviewer when multiple DIRECTORs are eligible', async () => {
  const fake = databaseWithDirectors([directorId, '00000000-0000-4000-8000-000000000003']);
  await assert.rejects(
    new BscReviewerResolver().resolveRequiredDirector(
      fake.db as never,
      { ownerId, permission: 'bsc.plan.approve.subordinate' },
    ),
    (error: any) => error.response.code === 'BSC_DIRECTOR_REVIEWER_AMBIGUOUS',
  );
});
