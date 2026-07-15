import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResourceScopePolicy } from '../src/common/policies/resource-scope.policy';
import { AuthUser } from '../src/common/types/auth-user.type';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';
import {
  BscWorkflowService,
  WorkflowBscContext,
} from '../src/modules/employee-bsc/services/bsc-workflow.service';

const employeeId = '00000000-0000-4000-8000-000000000001';
const managerId = '00000000-0000-4000-8000-000000000002';
const departmentId = '00000000-0000-4000-8000-000000000010';

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: employeeId,
  employeeCode: 'E001',
  fullName: 'Employee',
  email: 'employee@example.test',
  departmentId,
  status: 'ACTIVE',
  roles: [{ code: 'EMPLOYEE', scopeType: 'SELF', scopeId: null }],
  permissions: [BSC_PERMISSIONS.SUBMIT_OWN],
  ...overrides,
});

const context = (overrides: Partial<WorkflowBscContext> = {}): WorkflowBscContext => ({
  employeeId,
  directManagerId: managerId,
  departmentId,
  status: 'DRAFT',
  cycleStatus: 'OPEN',
  submissionDeadline: new Date('2099-12-31T23:59:59.000Z'),
  ownerActive: true,
  ownerOrganizationActive: true,
  reviewerActive: true,
  ...overrides,
});

const completeScoring = () => ({
  totalWeight: 100,
  scoredWeight: 100,
  totalWeightedScore: 95,
  isComplete: true,
  classification: 'A' as const,
  items: [{
    itemId: 'kpi-1', calculationMethod: 'ACTUAL_DIV_TARGET', target: 100, actual: 95,
    weight: 100, isScorable: true, achievementPercentage: 95, weightedScore: 95, reason: null,
  }],
});

const workflow = new BscWorkflowService(new ResourceScopePolicy());

test('workflow permits only the canonical Phase 3B.3 transition matrix', () => {
  for (const [from, action, to] of [
    ['DRAFT', 'SUBMIT', 'SUBMITTED'],
    ['RETURNED', 'SUBMIT', 'SUBMITTED'],
    ['SUBMITTED', 'APPROVE', 'APPROVED'],
    ['SUBMITTED', 'RETURN', 'RETURNED'],
  ] as const) {
    assert.equal(workflow.assertTransition(from, action), to);
  }

  for (const [from, action] of [
    ['DRAFT', 'APPROVE'], ['DRAFT', 'RETURN'], ['SUBMITTED', 'SUBMIT'],
    ['APPROVED', 'RETURN'], ['APPROVED', 'SUBMIT'], ['RETURNED', 'APPROVE'],
  ] as const) {
    assert.throws(
      () => workflow.assertTransition(from, action),
      (error: any) => error.response.code === 'BSC_INVALID_TRANSITION',
    );
  }
});

test('submit validation requires owner, current organization, reviewer and complete scoring', () => {
  assert.doesNotThrow(() => workflow.assertCanSubmit(actor(), context(), completeScoring()));

  const cases: Array<[WorkflowBscContext, ReturnType<typeof completeScoring>, string]> = [
    [context(), { ...completeScoring(), items: [], isComplete: false }, 'BSC_SUBMIT_INCOMPLETE'],
    [context(), { ...completeScoring(), totalWeight: 99, isComplete: false }, 'BSC_TOTAL_WEIGHT_NOT_100'],
    [context(), { ...completeScoring(), totalWeight: 101, isComplete: false }, 'BSC_TOTAL_WEIGHT_NOT_100'],
    [context(), { ...completeScoring(), isComplete: false, items: [{ ...completeScoring().items[0], actual: null, isScorable: false, reason: 'ACTUAL_NOT_PROVIDED' }] }, 'BSC_KPI_ACTUAL_REQUIRED'],
    [context(), { ...completeScoring(), isComplete: false, items: [{ ...completeScoring().items[0], isScorable: false, reason: 'CALCULATION_METHOD_UNSUPPORTED' }] }, 'BSC_KPI_NOT_SCORABLE'],
    [context(), { ...completeScoring(), isComplete: false, items: [{ ...completeScoring().items[0], calculationMethod: 'BINARY', actual: 2, isScorable: false, reason: 'BINARY_ACTUAL_INVALID' }] }, 'BSC_KPI_NOT_SCORABLE'],
    [context({ reviewerActive: false }), completeScoring(), 'BSC_APPROVER_REQUIRED'],
    [context({ ownerActive: false }), completeScoring(), 'BSC_OWNER_INACTIVE'],
    [context({ ownerOrganizationActive: false }), completeScoring(), 'BSC_OWNER_ORGANIZATION_INACTIVE'],
    [context({ cycleStatus: 'CLOSED' }), completeScoring(), 'BSC_CYCLE_NOT_OPEN'],
    [context({ submissionDeadline: new Date('2000-01-01T00:00:00.000Z') }), completeScoring(), 'BSC_SUBMISSION_DEADLINE_PASSED'],
  ];
  for (const [bsc, scoring, code] of cases) {
    assert.throws(() => workflow.assertCanSubmit(actor(), bsc, scoring), (error: any) => error.response.code === code);
  }

  assert.throws(
    () => workflow.assertCanSubmit(actor({ id: managerId }), context(), completeScoring()),
    (error: any) => error.response.code === 'BSC_ACCESS_DENIED',
  );
  assert.throws(
    () => workflow.assertCanSubmit(actor({ permissions: [] }), context(), completeScoring()),
    (error: any) => error.response.code === 'BSC_ACCESS_DENIED',
  );
});

test('approve and return require the direct manager, workflow permission, scope and a real reason', () => {
  const submitted = context({ status: 'SUBMITTED' });
  const manager = actor({
    id: managerId,
    roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: departmentId }],
    permissions: [BSC_PERMISSIONS.APPROVE_SUBORDINATE, BSC_PERMISSIONS.RETURN_SUBORDINATE],
  });
  assert.equal(workflow.assertCanReview(manager, submitted, 'APPROVE'), null);
  assert.equal(workflow.assertCanReview(manager, submitted, 'RETURN', '  Cần bổ sung minh chứng.  '), 'Cần bổ sung minh chứng.');

  for (const invalid of ['', '   ']) {
    assert.throws(
      () => workflow.assertCanReview(manager, submitted, 'RETURN', invalid),
      (error: any) => error.response.code === 'BSC_RETURN_REASON_REQUIRED',
    );
  }
  assert.throws(
    () => workflow.assertCanReview({ ...manager, id: employeeId }, submitted, 'APPROVE'),
    (error: any) => error.response.code === 'BSC_SELF_APPROVAL_FORBIDDEN',
  );
  assert.throws(
    () => workflow.assertCanReview({ ...manager, id: '00000000-0000-4000-8000-000000000099' }, submitted, 'APPROVE'),
    (error: any) => error.response.code === 'BSC_ACCESS_DENIED',
  );
  assert.throws(
    () => workflow.assertCanReview({ ...manager, permissions: [BSC_PERMISSIONS.VIEW_SUBORDINATE] }, submitted, 'APPROVE'),
    (error: any) => error.response.code === 'BSC_ACCESS_DENIED',
  );
  assert.throws(
    () => workflow.assertCanReview({ ...manager, roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: '00000000-0000-4000-8000-000000000099' }] }, submitted, 'APPROVE'),
    (error: any) => error.response.code === 'BSC_ACCESS_DENIED',
  );
});

test('workflow validation does not mutate caller-owned inputs', () => {
  const user = actor();
  const bsc = context();
  const scoring = completeScoring();
  const before = structuredClone({ user, bsc, scoring });
  workflow.assertCanSubmit(user, bsc, scoring);
  assert.deepEqual({ user, bsc, scoring }, before);
});
