import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { AuthUser } from '../src/common/types/auth-user.type';
import {
  BSC_PERMISSIONS,
  BscAccessPolicy,
} from '../src/modules/employee-bsc/policies/bsc-access.policy';
import {
  assertTotalWeight,
  assertBinaryActual,
  assertTargetCompatible,
  assertValidWeight,
} from '../src/modules/employee-bsc/validators/bsc-item.validator';
import { UpdateBscActualDto } from '../src/modules/employee-bsc/dto/bsc-item.dto';
import { QueryEmployeeBscDto } from '../src/modules/employee-bsc/dto/query-employee-bsc.dto';
import { PrismaService } from '../src/database/prisma.service';

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: '00000000-0000-4000-8000-000000000001',
  employeeCode: 'E001',
  fullName: 'Employee',
  email: 'employee@example.test',
  departmentId: '00000000-0000-4000-8000-000000000010',
  status: 'ACTIVE',
  roles: [{ code: 'EMPLOYEE', scopeType: 'SELF', scopeId: null,
    permissions: [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN] }],
  permissions: [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN],
  ...overrides,
});

const draft = {
  id: '00000000-0000-4000-8000-000000000100',
  employee_id: '00000000-0000-4000-8000-000000000001',
  department_id: '00000000-0000-4000-8000-000000000010',
  direct_manager_id: '00000000-0000-4000-8000-000000000002',
  status: 'DRAFT',
  plan_status: 'DRAFT',
  evaluation_status: 'NOT_STARTED',
};

test('BSC policy enforces owner, direct manager, scope, permission and DRAFT state', async () => {
  const relationshipDb = {
    manager_relationships: { count: async ({ where }: { where: { manager_id: string; employee_id: string } }) =>
      Number(where.manager_id === draft.direct_manager_id && where.employee_id === draft.employee_id) },
    users: { count: async () => 1 },
  } as unknown as PrismaService;
  const policy = new BscAccessPolicy(relationshipDb);
  const employee = user();
  policy.assertCanCreateOwn(employee);
  await policy.assertCanView(employee, draft);
  policy.assertCanUpdateActual(employee, { ...draft, plan_status: 'APPROVED', evaluation_status: 'DRAFT' });

  const manager = user({
    id: draft.direct_manager_id,
    roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: draft.department_id,
      permissions: [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI] }],
    permissions: [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI],
  });
  await policy.assertCanView(manager, draft);
  await assert.rejects(policy.assertCanManageKpi(manager, draft), (error: any) => error.response.code === 'BSC_ACCESS_DENIED');

  await policy.assertCanManageKpi(employee, draft);
  await assert.rejects(policy.assertCanManageKpi({ ...manager, id: '00000000-0000-4000-8000-000000000099' }, draft));
  await assert.rejects(policy.assertCanView({ ...manager, id: '00000000-0000-4000-8000-000000000099' }, draft));
  await policy.assertCanView(user({ roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null,
    permissions: [BSC_PERMISSIONS.VIEW_UNIT] }], permissions: [BSC_PERMISSIONS.VIEW_UNIT] }), draft);
  assert.throws(() => policy.assertCanUpdateActual(employee, { ...draft, plan_status: 'SUBMITTED' }), (error: any) => error.response.code === 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE');
});

test('BSC policy rejects DIRECTOR and ADMIN personal BSC creation', () => {
  const policy = new BscAccessPolicy({} as PrismaService);
  for (const code of ['DIRECTOR', 'ADMIN']) {
    assert.throws(
      () => policy.assertCanCreateOwn(user({ roles: [{ code, scopeType: 'GLOBAL', scopeId: null,
        permissions: [BSC_PERMISSIONS.CREATE_OWN] }] })),
      (error: any) => error.response.code === (code === 'DIRECTOR' ? 'BSC_DIRECTOR_NOT_ELIGIBLE' : 'BSC_OWNER_NOT_ELIGIBLE'),
    );
  }
});

test('BSC weight accepts partial and exact drafts but rejects invalid or excessive totals', () => {
  assert.doesNotThrow(() => assertValidWeight(0.01));
  assert.doesNotThrow(() => assertValidWeight(100));
  for (const value of [0, -1, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => assertValidWeight(value), (error: any) => error.response.code === 'BSC_WEIGHT_INVALID');
  }
  assert.doesNotThrow(() => assertTotalWeight(75));
  assert.doesNotThrow(() => assertTotalWeight(100));
  assert.throws(() => assertTotalWeight(100.01), (error: any) => error.response.code === 'BSC_TOTAL_WEIGHT_EXCEEDED');
  assert.throws(() => assertTargetCompatible('ACTUAL_DIV_TARGET', 0), (error: any) => error.response.code === 'BSC_TARGET_INVALID');
  assert.doesNotThrow(() => assertTargetCompatible('TARGET_DIV_ACTUAL', 0));
  assert.doesNotThrow(() => assertBinaryActual('BINARY', 0));
  assert.doesNotThrow(() => assertBinaryActual('BINARY', 1));
  for (const value of [-1, 0.5, 2]) {
    assert.throws(() => assertBinaryActual('BINARY', value), (error: any) => error.response.code === 'BSC_BINARY_ACTUAL_INVALID');
  }
});

test('BSC DTOs reject cross-field mass assignment and non-allowlisted sort keys', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  await assert.rejects(
    pipe.transform({ actualValue: 10, targetValue: 999 }, { type: 'body', metatype: UpdateBscActualDto, data: '' }),
  );
  await assert.rejects(
    pipe.transform({ sortBy: 'status' }, { type: 'query', metatype: QueryEmployeeBscDto, data: '' }),
  );
});
