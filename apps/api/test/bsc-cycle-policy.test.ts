import assert from 'node:assert/strict';
import test from 'node:test';
import { BscCyclePolicy, CycleTiming } from '../src/modules/bsc-cycles/bsc-cycle.policy';

const policy = new BscCyclePolicy();
const timing = (overrides: Partial<CycleTiming> = {}): CycleTiming => ({
  status: 'OPEN',
  ...overrides,
});

test('PLAN work only requires an OPEN cycle and ignores the evaluation deadline', () => {
  assert.doesNotThrow(() => policy.assertCycleAllowsPlanWork(timing()));
  assert.doesNotThrow(() => policy.assertBusinessAction(timing(), 'SUBMIT_PLAN'));
  for (const status of ['DRAFT', 'LOCKED', 'CLOSED'] as const) {
    assert.throws(() => policy.assertCycleAllowsPlanWork(timing({ status })),
      (error: any) => error.response.code === (status === 'LOCKED' ? 'BSC_CYCLE_LOCKED' : status === 'CLOSED' ? 'BSC_CYCLE_CLOSED' : 'BSC_CYCLE_NOT_OPEN'));
  }
});

test('EVALUATION edit and submit only require an OPEN cycle', () => {
  assert.doesNotThrow(() => policy.assertCycleAllowsEvaluationEdit(timing()));
  assert.doesNotThrow(() => policy.assertCycleAllowsEvaluationSubmit(timing()));
});

test('duplicate only requires an OPEN target and ignores the evaluation deadline', () => {
  assert.doesNotThrow(() => policy.assertBusinessAction(timing(), 'DUPLICATE_TARGET'));
  assert.throws(() => policy.assertCycleAllowsDuplicate(timing({ status: 'LOCKED' })),
    (error: any) => error.response.code === 'BSC_CYCLE_LOCKED');
});

test('cycle lifecycle lets ADMIN close an OPEN or LOCKED cycle manually', () => {
  const actor = { roles: [{ scopeType: 'GLOBAL', permissions: ['bsc.period.manage'] }] } as any;
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'DRAFT', 'OPEN'));
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'OPEN', 'LOCKED'));
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'LOCKED', 'OPEN'));
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'OPEN', 'CLOSED'));
  assert.doesNotThrow(() => policy.assertCanTransitionCycle(actor, 'LOCKED', 'CLOSED'));
});
