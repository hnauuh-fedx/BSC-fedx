import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { ResourceScopePolicy } from '../src/common/policies/resource-scope.policy';
import { AuthUser } from '../src/common/types/auth-user.type';
import { BSC_PERMISSIONS, BscAccessPolicy } from '../src/modules/employee-bsc/policies/bsc-access.policy';
import { BscWorkflowService, WorkflowBscContext } from '../src/modules/employee-bsc/services/bsc-workflow.service';
import { PrismaService } from '../src/database/prisma.service';
import { BscCyclePolicy } from '../src/modules/bsc-cycles/bsc-cycle.policy';

const employeeId = '00000000-0000-4000-8000-000000000001';
const managerId = '00000000-0000-4000-8000-000000000002';
const departmentId = '00000000-0000-4000-8000-000000000010';

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: employeeId, employeeCode: 'E001', fullName: 'Employee', email: 'employee@example.test',
  departmentId, status: 'ACTIVE', roles: [{ code: 'EMPLOYEE', scopeType: 'SELF', scopeId: null }],
  permissions: [BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN], ...overrides,
});

const context = (overrides: Partial<WorkflowBscContext> = {}): WorkflowBscContext => ({
  employeeId, directManagerId: managerId, departmentId, planStatus: 'DRAFT', evaluationStatus: 'NOT_STARTED',
  cycleStatus: 'OPEN', ownerActive: true,
  ownerOrganizationActive: true, reviewerActive: true, ...overrides,
});

const definition = (overrides: Record<string, unknown> = {}) => ({
  items: [{ kpiName: 'Doanh thu', targetValue: 100, targetText: null, weight: 100, calculationMethod: 'ACTUAL_DIV_TARGET' }],
  ...overrides,
});

const scoring = (overrides: Record<string, unknown> = {}) => ({
  totalWeight: 100, scoredWeight: 100, totalWeightedScore: 100, isComplete: true, classification: 'A' as const,
  canonicalTotalWeightedScore: new Prisma.Decimal(100),
  items: [{ itemId: 'kpi-1', calculationMethod: 'ACTUAL_DIV_TARGET', target: 100, actual: 95,
    weight: 100, isScorable: true, rawAchievementPercentage: 95, roundedAchievementPercentage: 95,
    rawWorkScore: 95, roundedWorkScore: 100, weightedScore: 100, reason: null }],
  ...overrides,
});

const scope = new ResourceScopePolicy();
const workflow = new BscWorkflowService(scope, new BscCyclePolicy());

test('plan transition matrix is independent from evaluation', () => {
  for (const [from, action, to] of [
    ['DRAFT', 'SUBMIT_PLAN', 'SUBMITTED'], ['RETURNED', 'SUBMIT_PLAN', 'SUBMITTED'],
    ['REOPENED', 'SUBMIT_PLAN', 'SUBMITTED'],
    ['SUBMITTED', 'APPROVE_PLAN', 'APPROVED'], ['SUBMITTED', 'RETURN_PLAN', 'RETURNED'],
  ] as const) assert.equal(workflow.assertPlanTransition(from, action), to);

  for (const [from, action] of [
    ['DRAFT', 'APPROVE_PLAN'], ['APPROVED', 'SUBMIT_PLAN'], ['APPROVED', 'RETURN_PLAN'], ['RETURNED', 'APPROVE_PLAN'],
  ] as const) assert.throws(() => workflow.assertPlanTransition(from, action), (e: any) => e.response.code === 'BSC_PLAN_INVALID_TRANSITION');
});

test('evaluation transition matrix cannot start before plan approval', () => {
  for (const [from, action, to] of [
    ['DRAFT', 'SUBMIT_EVALUATION', 'SUBMITTED'], ['RETURNED', 'SUBMIT_EVALUATION', 'SUBMITTED'],
    ['REOPENED', 'SUBMIT_EVALUATION', 'SUBMITTED'],
    ['SUBMITTED', 'APPROVE_EVALUATION', 'APPROVED'], ['SUBMITTED', 'RETURN_EVALUATION', 'RETURNED'],
  ] as const) assert.equal(workflow.assertEvaluationTransition(from, action), to);

  for (const [from, action] of [
    ['NOT_STARTED', 'SUBMIT_EVALUATION'], ['DRAFT', 'APPROVE_EVALUATION'],
    ['APPROVED', 'SUBMIT_EVALUATION'], ['RETURNED', 'APPROVE_EVALUATION'],
  ] as const) assert.throws(() => workflow.assertEvaluationTransition(from, action), (e: any) => e.response.code === 'BSC_EVALUATION_INVALID_TRANSITION');
});

test('plan submit validates definition but never requires actual or scoring', () => {
  assert.doesNotThrow(() => workflow.assertCanSubmitPlan(actor(), context(), definition()));
  for (const [input, code] of [
    [definition({ items: [] }), 'BSC_PLAN_INCOMPLETE'],
    [definition({ items: [{ ...definition().items[0], weight: 99 }] }), 'BSC_PLAN_TOTAL_WEIGHT_NOT_100'],
    [definition({ items: [{ ...definition().items[0], weight: 101 }] }), 'BSC_PLAN_TOTAL_WEIGHT_NOT_100'],
    [definition({ items: [{ ...definition().items[0], kpiName: '' }] }), 'BSC_PLAN_INCOMPLETE'],
    [definition({ items: [{ ...definition().items[0], targetValue: null, targetText: null }] }), 'BSC_PLAN_INCOMPLETE'],
    [definition({ items: [{ ...definition().items[0], calculationMethod: 'UNKNOWN' }] }), 'BSC_PLAN_INCOMPLETE'],
  ] as const) assert.throws(() => workflow.assertCanSubmitPlan(actor(), context(), input as any), (e: any) => e.response.code === code);
});

test('evaluation submit requires approved plan and complete server scoring', () => {
  const evaluation = context({ planStatus: 'APPROVED', evaluationStatus: 'DRAFT' });
  assert.doesNotThrow(() => workflow.assertCanSubmitEvaluation(actor(), evaluation, scoring()));
  assert.throws(() => workflow.assertCanSubmitEvaluation(actor(), context({ evaluationStatus: 'DRAFT' }), scoring()), (e: any) => e.response.code === 'BSC_EVALUATION_NOT_AVAILABLE');
  assert.throws(() => workflow.assertCanSubmitEvaluation(actor(), evaluation, scoring({ isComplete: false })), (e: any) => e.response.code === 'BSC_EVALUATION_INCOMPLETE');
  assert.throws(() => workflow.assertCanSubmitEvaluation(actor(), evaluation, scoring({ isComplete: false, items: [{ ...scoring().items[0], actual: null, isScorable: false, reason: 'ACTUAL_NOT_PROVIDED' }] })), (e: any) => e.response.code === 'BSC_EVALUATION_ACTUAL_REQUIRED');
});

test('stage reviews require direct reviewer, stage permission and stage-specific reason codes', () => {
  const manager = actor({ id: managerId, roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: departmentId }],
    permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE] });
  assert.equal(workflow.assertCanReviewPlan(manager, context({ planStatus: 'SUBMITTED' }), 'APPROVE_PLAN'), null);
  assert.equal(workflow.assertCanReviewEvaluation(manager, context({ planStatus: 'APPROVED', evaluationStatus: 'SUBMITTED' }), 'RETURN_EVALUATION', '  Cần bổ sung. '), 'Cần bổ sung.');
  assert.throws(() => workflow.assertCanReviewPlan(manager, context({ planStatus: 'SUBMITTED' }), 'RETURN_PLAN', ' '), (e: any) => e.response.code === 'BSC_PLAN_RETURN_REASON_REQUIRED');
  assert.throws(() => workflow.assertCanReviewEvaluation(manager, context({ planStatus: 'APPROVED', evaluationStatus: 'SUBMITTED' }), 'RETURN_EVALUATION', ' '), (e: any) => e.response.code === 'BSC_EVALUATION_RETURN_REASON_REQUIRED');
});

test('field locking keeps definition and evaluation result groups independent', async () => {
  const relationshipDb = { manager_relationships: { count: async () => 1 } } as unknown as PrismaService;
  const policy = new BscAccessPolicy(relationshipDb);
  const manager = actor({ id: managerId, roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: departmentId,
    permissions: [BSC_PERMISSIONS.MANAGE_KPI] }], permissions: [BSC_PERMISSIONS.MANAGE_KPI] });
  const owner = actor({ roles: [{ code: 'EMPLOYEE', scopeType: 'SELF', scopeId: null,
    permissions: [BSC_PERMISSIONS.UPDATE_ACTUAL] }], permissions: [BSC_PERMISSIONS.UPDATE_ACTUAL] });
  const base = { employee_id: employeeId, department_id: departmentId, direct_manager_id: managerId, status: 'DRAFT' };

  await assert.doesNotReject(policy.assertCanEditPlanDefinition(manager, { ...base, plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED' }));
  await assert.rejects(policy.assertCanEditPlanDefinition(manager, { ...base, plan_status: 'APPROVED', evaluation_status: 'DRAFT' }), (e: any) => e.response.code === 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE');
  assert.doesNotThrow(() => policy.assertCanEditEvaluationResult(owner, { ...base, plan_status: 'APPROVED', evaluation_status: 'DRAFT' }));
  assert.doesNotThrow(() => policy.assertCanEditEvaluationResult(owner, { ...base, plan_status: 'APPROVED', evaluation_status: 'RETURNED' }));
  assert.throws(() => policy.assertCanEditEvaluationResult(owner, { ...base, plan_status: 'SUBMITTED', evaluation_status: 'NOT_STARTED' }), (e: any) => e.response.code === 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE');
  assert.throws(() => policy.assertCanEditEvaluationResult(owner, { ...base, plan_status: 'APPROVED', evaluation_status: 'SUBMITTED' }), (e: any) => e.response.code === 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE');
});
