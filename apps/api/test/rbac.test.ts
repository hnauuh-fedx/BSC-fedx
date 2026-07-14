import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResourceScopePolicy } from '../src/common/policies/resource-scope.policy';
import { AuthRepository } from '../src/modules/auth/repositories/auth.repository';
import { JwtAccessStrategy } from '../src/modules/auth/strategies/jwt-access.strategy';

process.env.NODE_ENV = 'test'; process.env.API_PORT = '3001'; process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'; process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars!'; process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars!'; process.env.JWT_ACCESS_EXPIRES_IN = '15m'; process.env.JWT_REFRESH_EXPIRES_IN = '7d'; process.env.CORS_ORIGIN = 'http://localhost:5173';

const baseUser = (assignments: Array<{ code: string; scope_type: 'GLOBAL' | 'DEPARTMENT' | 'SELF'; scope_id: string | null; permissions: string[] }>) => ({
  id: 'u1', employee_code: 'E1', full_name: 'User One', email: 'u1@example.test', department_id: 'd1', status: 'ACTIVE', deleted_at: null,
  user_roles_user_roles_user_idTousers: assignments.map((assignment) => ({ scope_type: assignment.scope_type, scope_id: assignment.scope_id, roles: { code: assignment.code, role_permissions: assignment.permissions.map((code) => ({ permissions: { code } })) } })),
});

test('JWT validation reloads and deduplicates active permissions from database', async () => {
  let current = baseUser([{ code: 'MANAGER', scope_type: 'DEPARTMENT', scope_id: 'd1', permissions: ['bsc.view', 'bsc.approve'] }, { code: 'SECOND', scope_type: 'SELF', scope_id: null, permissions: ['bsc.approve'] }]);
  const strategy = new JwtAccessStrategy({ findAuthUserById: async () => current } as unknown as AuthRepository);
  const first = await strategy.validate({ sub: 'u1', email: 'old@example.test', type: 'access' });
  assert.deepEqual(first.permissions.sort(), ['bsc.approve', 'bsc.view']);
  current = baseUser([{ code: 'EMPLOYEE', scope_type: 'SELF', scope_id: null, permissions: ['bsc.view'] }]);
  const second = await strategy.validate({ sub: 'u1', email: 'old@example.test', type: 'access' });
  assert.deepEqual(second.permissions, ['bsc.view']);
});

test('repository filters expired and inactive role assignments in one relation query', async () => {
  let captured: unknown;
  const repository = new AuthRepository({ users: { findUnique: async (args: unknown) => { captured = args; return null; } } } as any);
  await repository.findAuthUserById('u1');
  const query = JSON.stringify(captured);
  assert.match(query, /expires_at/); assert.match(query, /ACTIVE/); assert.match(query, /role_permissions/);
});

test('permissions guard requires every declared permission and returns denial code', () => {
  const guard = new PermissionsGuard({ getAllAndOverride: () => ['user.view', 'user.update'] } as any);
  const context = { getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => ({ user: { permissions: ['user.view'] } }) }) } as any;
  assert.throws(() => guard.canActivate(context), (error: any) => error.response.code === 'AUTH_PERMISSION_DENIED');
});

test('scope policy permits one matching scope and denies wrong department or owner', () => {
  const policy = new ResourceScopePolicy();
  const departmentUser = { id: 'u1', employeeCode: 'E1', fullName: 'User', email: 'u@example.test', departmentId: 'd1', status: 'ACTIVE', permissions: [], roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT' as const, scopeId: 'd1' }, { code: 'EMPLOYEE', scopeType: 'SELF' as const, scopeId: null }] };
  policy.assertResourceScope(departmentUser, { departmentId: 'd1' });
  policy.assertResourceScope(departmentUser, { ownerId: 'u1' });
  assert.throws(() => policy.assertResourceScope(departmentUser, { departmentId: 'd2' }));
  assert.throws(() => policy.assertResourceScope(departmentUser, { ownerId: 'u2' }));
  policy.assertResourceScope({ ...departmentUser, roles: [...departmentUser.roles, { code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null }] }, { departmentId: 'd2' });
});

test('ADMIN receives all canonical administration permissions and never implicit BSC approval', async () => {
  const canonical = ['user.view', 'user.create', 'user.update', 'user.lock', 'user.password.reset', 'department.view', 'department.manage', 'position.view', 'position.manage', 'role.view', 'role.manage', 'permission.view', 'permission.assign', 'bsc.period.view', 'bsc.period.manage', 'bsc.template.view', 'bsc.template.manage', 'audit.view'];
  const strategy = new JwtAccessStrategy({ findAuthUserById: async () => baseUser([{ code: 'ADMIN', scope_type: 'GLOBAL', scope_id: null, permissions: canonical }]) } as unknown as AuthRepository);
  const user = await strategy.validate({ sub: 'u1', email: 'u1@example.test', type: 'access' });
  assert.deepEqual(user.permissions.sort(), canonical.sort());
  const removedLegacyPermission = ['system', 'user', 'manage'].join('.');
  for (const permission of ['bsc.approve', 'bsc.review', 'bsc.return', 'bsc.approve.subordinate', removedLegacyPermission]) assert.equal(user.permissions.includes(permission), false);
});
