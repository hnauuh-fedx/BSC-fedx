import assert from 'node:assert/strict';
import test from 'node:test';
import { BscCyclePolicy, CycleTiming } from '../src/modules/bsc-cycles/bsc-cycle.policy';

const policy = new BscCyclePolicy();
const deadline = new Date('2026-07-28T16:59:59.999Z');
const timing = (overrides: Partial<CycleTiming> = {}): CycleTiming => ({
  status: 'OPEN',
  startDate: new Date('2026-07-01T00:00:00.000Z'),
  endDate: new Date('2026-07-31T00:00:00.000Z'),
  submissionDeadline: deadline,
  ...overrides,
});

test('PLAN work only requires an OPEN cycle and ignores the evaluation deadline', () => {
  const afterDeadline = new Date(deadline.getTime() + 1);
  assert.doesNotThrow(() => policy.assertCycleAllowsPlanWork(timing()));
  assert.doesNotThrow(() => policy.assertBusinessAction(timing(), 'SUBMIT_PLAN', afterDeadline));
  for (const status of ['DRAFT', 'LOCKED', 'CLOSED'] as const) {
    assert.throws(() => policy.assertCycleAllowsPlanWork(timing({ status })),
      (error: any) => error.response.code === (status === 'LOCKED' ? 'BSC_CYCLE_LOCKED' : status === 'CLOSED' ? 'BSC_CYCLE_CLOSED' : 'BSC_CYCLE_NOT_OPEN'));
  }
});

test('EVALUATION edit only requires OPEN while submit uses the inclusive legacy deadline', () => {
  assert.doesNotThrow(() => policy.assertCycleAllowsEvaluationEdit(timing()));
  assert.doesNotThrow(() => policy.assertCycleAllowsEvaluationSubmit(timing(), deadline));
  assert.throws(() => policy.assertCycleAllowsEvaluationSubmit(timing(), new Date(deadline.getTime() + 1)),
    (error: any) => error.response.code === 'BSC_EVALUATION_SUBMISSION_DEADLINE_PASSED');
});

test('duplicate only requires an OPEN target and ignores the evaluation deadline', () => {
  assert.doesNotThrow(() => policy.assertBusinessAction(timing(), 'DUPLICATE_TARGET', new Date(deadline.getTime() + 1)));
  assert.throws(() => policy.assertCycleAllowsDuplicate(timing({ status: 'LOCKED' })),
    (error: any) => error.response.code === 'BSC_CYCLE_LOCKED');
});

test('cycle timeline validates the legacy evaluation submission deadline', () => {
  assert.doesNotThrow(() => policy.assertValidTimeline(timing()));
  assert.throws(() => policy.assertValidTimeline(timing({ submissionDeadline: new Date('2026-08-01T00:00:00Z') })),
    (error: any) => error.response.code === 'BSC_CYCLE_TIMELINE_INVALID');
});

test('cycle lifecycle exposes only open and lock transitions', () => {
  const actor = { roles: [{ scopeType: 'GLOBAL', permissions: ['bsc.period.manage'] }] } as any;
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'DRAFT', 'OPEN'));
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'OPEN', 'LOCKED'));
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'LOCKED', 'OPEN'));
  assert.throws(() => policy.assertCanTransitionCycle(actor, 'OPEN', 'CLOSED'),
    (error: any) => error.response.code === 'BSC_CYCLE_INVALID_TRANSITION');
});
