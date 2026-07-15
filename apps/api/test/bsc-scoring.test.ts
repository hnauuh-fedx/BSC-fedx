import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BscClassificationService } from '../src/modules/employee-bsc/services/bsc-classification.service';
import { BscScoringService } from '../src/modules/employee-bsc/services/bsc-scoring.service';

const scoring = new BscScoringService(new BscClassificationService());

test('higher-is-better returns the worked scoring examples', () => {
  for (const [actual, achievementPercentage, weightedScore] of [
    [80, 80, 16],
    [100, 100, 20],
    [120, 120, 24],
  ]) {
    const result = scoring.scoreItem({ itemId: 'higher', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: actual, weight: 20 });
    assert.equal(result.achievementPercentage, achievementPercentage);
    assert.equal(result.weightedScore, weightedScore);
    assert.equal(result.isScorable, true);
  }
});

test('lower-is-better returns the worked scoring examples', () => {
  for (const [actual, achievementPercentage, weightedScore] of [
    [20, 50, 10],
    [10, 100, 20],
    [8, 125, 25],
  ]) {
    const result = scoring.scoreItem({ itemId: 'lower', calculationMethod: 'TARGET_DIV_ACTUAL', targetValue: 10, actualValue: actual, weight: 20 });
    assert.equal(result.achievementPercentage, achievementPercentage);
    assert.equal(result.weightedScore, weightedScore);
  }
});

test('binary scoring uses canonical 1 for pass and 0 for fail', () => {
  assert.deepEqual(scoring.scoreItem({ itemId: 'pass', calculationMethod: 'BINARY', targetValue: null, actualValue: 1, weight: 20 }), {
    itemId: 'pass', calculationMethod: 'BINARY', target: null, actual: 1, weight: 20,
    isScorable: true, achievementPercentage: 100, weightedScore: 20, reason: null,
  });
  assert.equal(scoring.scoreItem({ itemId: 'fail', calculationMethod: 'BINARY', targetValue: null, actualValue: 0, weight: 20 }).weightedScore, 0);
  assert.equal(scoring.scoreItem({ itemId: 'invalid', calculationMethod: 'BINARY', targetValue: null, actualValue: 2, weight: 20 }).reason, 'BINARY_ACTUAL_INVALID');
});

test('incomplete and unsupported data never produces NaN or Infinity', () => {
  const cases = [
    [{ calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: null }, 'ACTUAL_NOT_PROVIDED'],
    [{ calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 0, actualValue: 10 }, 'TARGET_ZERO_NOT_SCORABLE'],
    [{ calculationMethod: 'TARGET_DIV_ACTUAL', targetValue: 10, actualValue: 0 }, 'ACTUAL_ZERO_NOT_SCORABLE'],
    [{ calculationMethod: 'THRESHOLD', targetValue: 10, actualValue: 10 }, 'CALCULATION_METHOD_UNSUPPORTED'],
    [{ calculationMethod: 'UNKNOWN', targetValue: 10, actualValue: 10 }, 'CALCULATION_METHOD_UNSUPPORTED'],
  ] as const;
  for (const [input, reason] of cases) {
    const result = scoring.scoreItem({ itemId: reason, weight: 20, ...input });
    assert.equal(result.isScorable, false);
    assert.equal(result.reason, reason);
    assert.equal(result.achievementPercentage, null);
    assert.equal(result.weightedScore, null);
    assert.doesNotMatch(JSON.stringify(result), /NaN|Infinity/);
  }
});

test('decimal arithmetic is stable, supports large values and does not mutate input', () => {
  const input = { itemId: 'decimal', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: '0.3', actualValue: '0.1', weight: '33.33' };
  const before = structuredClone(input);
  const decimal = scoring.scoreItem(input);
  assert.equal(decimal.achievementPercentage, 33.3333);
  assert.equal(decimal.weightedScore, 11.11);
  assert.deepEqual(input, before);

  const large = scoring.scoreItem({ itemId: 'large', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: '1000000000000000', actualValue: '999999999999999', weight: 100 });
  assert.equal(large.isScorable, true);
  assert.equal(Number.isFinite(large.achievementPercentage!), true);
  assert.equal(Number.isFinite(large.weightedScore!), true);
});

test('BSC totals distinguish total weight, scored weight, provisional score and completeness', () => {
  const incomplete = scoring.scoreBsc([
    { itemId: 'one', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 80, weight: 80 },
    { itemId: 'two', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: null, weight: 20 },
  ]);
  assert.deepEqual({ totalWeight: incomplete.totalWeight, scoredWeight: incomplete.scoredWeight, totalWeightedScore: incomplete.totalWeightedScore, isComplete: incomplete.isComplete, classification: incomplete.classification }, {
    totalWeight: 100, scoredWeight: 80, totalWeightedScore: 64, isComplete: false, classification: null,
  });

  const partialWeight = scoring.scoreBsc([{ itemId: 'one', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 100, weight: 80 }]);
  assert.equal(partialWeight.totalWeightedScore, 80);
  assert.equal(partialWeight.isComplete, false);
  assert.equal(partialWeight.classification, null);
});

test('classification owns every required boundary and uses the unrounded total', () => {
  const classification = new BscClassificationService();
  for (const [score, grade] of [[79.99, 'C'], [80, 'B'], [89.99, 'B'], [90, 'A'], [100, 'A'], [100.01, 'A+'], [101, 'A+'], [110, 'A+'], [110.99, 'A+'], [111, 'A++']] as const) {
    assert.equal(classification.classify(score), grade);
  }
  assert.equal(classification.classify('89.995'), 'B');
  const preview = scoring.scoreBsc([{ itemId: 'raw-boundary', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: '2', actualValue: '1.799999', weight: 100 }]);
  assert.equal(preview.totalWeightedScore, 90);
  assert.equal(preview.classification, 'B');
});
