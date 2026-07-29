import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BscClassificationService } from '../src/modules/employee-bsc/services/bsc-classification.service';
import { BscScoringService } from '../src/modules/employee-bsc/services/bsc-scoring.service';

const scoring = new BscScoringService(new BscClassificationService());

test('achievement percentage rounds HALF_UP directly from its raw Decimal value', () => {
  for (const [raw, rounded] of [
    ['87.1', 87], ['87.4', 87], ['87.5', 88], ['87.9', 88], ['100', 100],
    ['101.4', 101], ['101.5', 102], ['101.9', 102], ['158.4', 158], ['158.5', 159],
  ] as const) {
    assert.equal(scoring.roundAchievementPercentage(raw), rounded);
  }
});

test('work score rounds HALF_UP to the nearest ten directly from raw work score', () => {
  for (const [raw, rounded] of [
    ['80', 80], ['81', 80], ['82', 80], ['84', 80], ['85', 90], ['86', 90], ['89', 90],
    ['90', 90], ['91', 90], ['94', 90], ['95', 100], ['99', 100], ['100', 100],
    ['101', 100], ['104', 100], ['105', 110], ['109', 110], ['110', 110], ['158', 160],
    ['84.4', 80], ['84.9', 80], ['85.0', 90], ['85.1', 90], ['94.9', 90], ['95', 100],
  ] as const) {
    assert.equal(scoring.roundWorkScore(raw), rounded);
  }
});

test('achievement and work score rounding are independent', () => {
  assert.deepEqual(scoring.alignRawScores('87.9', '84', 20), {
    rawAchievementPercentage: 87.9,
    roundedAchievementPercentage: 88,
    rawWorkScore: 84,
    roundedWorkScore: 80,
    weightedScore: 16,
  });
  assert.deepEqual(scoring.alignRawScores('87.9', '86', 20), {
    rawAchievementPercentage: 87.9,
    roundedAchievementPercentage: 88,
    rawWorkScore: 86,
    roundedWorkScore: 90,
    weightedScore: 18,
  });
  assert.equal(scoring.alignRawScores('87.1', '84', 20).roundedWorkScore, 80);
  assert.equal(scoring.alignRawScores('87.9', '84', 20).roundedWorkScore, 80);
});

test('weighted score uses rounded work score and retains Decimal precision', () => {
  for (const [work, weight, weighted] of [[90, 20, 18], [160, 20, 32], [80, 15, 12], [110, 25, 27.5]] as const) {
    assert.equal(scoring.calculateWeightedScore(work, weight), weighted);
  }
  assert.equal(scoring.calculateWeightedScore('90', '33.3333'), 30);
});

test('higher, lower and binary methods expose distinct raw and rounded score fields', () => {
  assert.deepEqual(scoring.scoreItem({ itemId: 'higher', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 1000, actualValue: 879, weight: 20 }), {
    itemId: 'higher', calculationMethod: 'ACTUAL_DIV_TARGET', target: 1000, actual: 879, weight: 20,
    isScorable: true, reason: null,
    rawAchievementPercentage: 87.9, roundedAchievementPercentage: 88,
    rawWorkScore: 87.9, roundedWorkScore: 90, weightedScore: 18,
  });
  assert.equal(scoring.scoreItem({ itemId: 'lower', calculationMethod: 'TARGET_DIV_ACTUAL', targetValue: 10, actualValue: 8, weight: 20 }).roundedWorkScore, 130);
  assert.deepEqual(scoring.scoreItem({ itemId: 'pass', calculationMethod: 'BINARY', targetValue: null, actualValue: 1, weight: 20 }), {
    itemId: 'pass', calculationMethod: 'BINARY', target: null, actual: 1, weight: 20,
    isScorable: true, reason: null,
    rawAchievementPercentage: 100, roundedAchievementPercentage: 100,
    rawWorkScore: 100, roundedWorkScore: 100, weightedScore: 20,
  });
  assert.equal(scoring.scoreItem({ itemId: 'fail', calculationMethod: 'BINARY', targetValue: null, actualValue: 0, weight: 20 }).weightedScore, 0);
});

test('incomplete and unsupported data never produces score fields, NaN or Infinity', () => {
  const cases = [
    [{ calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: null }, 'ACTUAL_NOT_PROVIDED'],
    [{ calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: null, actualValue: 10 }, 'TARGET_NOT_PROVIDED'],
    [{ calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 0, actualValue: 10 }, 'TARGET_ZERO_NOT_SCORABLE'],
    [{ calculationMethod: 'TARGET_DIV_ACTUAL', targetValue: 10, actualValue: 0 }, 'ACTUAL_ZERO_NOT_SCORABLE'],
    [{ calculationMethod: 'BINARY', targetValue: null, actualValue: 2 }, 'BINARY_ACTUAL_INVALID'],
    [{ calculationMethod: 'THRESHOLD', targetValue: 10, actualValue: 10 }, 'CALCULATION_METHOD_UNSUPPORTED'],
  ] as const;
  for (const [input, reason] of cases) {
    const result = scoring.scoreItem({ itemId: reason, weight: 20, ...input });
    assert.equal(result.isScorable, false);
    assert.equal(result.reason, reason);
    assert.equal(result.rawAchievementPercentage, null);
    assert.equal(result.roundedAchievementPercentage, null);
    assert.equal(result.rawWorkScore, null);
    assert.equal(result.roundedWorkScore, null);
    assert.equal(result.weightedScore, null);
    assert.doesNotMatch(JSON.stringify(result), /NaN|Infinity/);
  }
});

test('Decimal arithmetic supports large values and does not mutate input', () => {
  const input = { itemId: 'decimal', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: '0.3', actualValue: '0.1', weight: '33.33' };
  const before = structuredClone(input);
  const decimal = scoring.scoreItem(input);
  assert.equal(decimal.rawAchievementPercentage, 33.3333);
  assert.equal(decimal.roundedAchievementPercentage, 33);
  assert.equal(decimal.roundedWorkScore, 30);
  assert.equal(decimal.weightedScore, 9.999);
  assert.deepEqual(input, before);

  const large = scoring.scoreItem({ itemId: 'large', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: '1000000000000000', actualValue: '1585000000000000', weight: 100 });
  assert.equal(large.rawAchievementPercentage, 158.5);
  assert.equal(large.roundedAchievementPercentage, 159);
  assert.equal(large.roundedWorkScore, 160);
  assert.equal(large.weightedScore, 160);
  assert.doesNotMatch(JSON.stringify(large), /NaN|Infinity/);
});

test('BSC total sums exact weighted Decimals and completeness gates classification', () => {
  const complete = scoring.scoreBsc([
    { itemId: 'one', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 94, weight: '33.3333' },
    { itemId: 'two', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 95, weight: '66.6667' },
  ]);
  assert.deepEqual({ totalWeight: complete.totalWeight, scoredWeight: complete.scoredWeight, totalWeightedScore: complete.totalWeightedScore, isComplete: complete.isComplete, classification: complete.classification }, {
    totalWeight: 100, scoredWeight: 100, totalWeightedScore: 96.6667, isComplete: true, classification: 'A',
  });

  const incomplete = scoring.scoreBsc([
    { itemId: 'one', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 80, weight: 80 },
    { itemId: 'two', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: null, weight: 20 },
  ]);
  assert.deepEqual({ totalWeight: incomplete.totalWeight, scoredWeight: incomplete.scoredWeight, totalWeightedScore: incomplete.totalWeightedScore, isComplete: incomplete.isComplete, classification: incomplete.classification }, {
    totalWeight: 100, scoredWeight: 80, totalWeightedScore: 64, isComplete: false, classification: null,
  });
});

test('worked BSC example totals rounded work scores to 92 points', () => {
  const result = scoring.scoreBsc([
    { itemId: 'common', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 100, weight: 5 },
    { itemId: '1.1', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 87.9, weight: 20 },
    { itemId: '2.1', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 158.4, weight: 10 },
    { itemId: '2.2', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 78.1, weight: 30 },
    { itemId: '2.3', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 101.9, weight: 24 },
    { itemId: '2.4', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 0, weight: 6 },
    { itemId: '3.1', calculationMethod: 'ACTUAL_DIV_TARGET', targetValue: 100, actualValue: 100, weight: 5 },
  ]);

  assert.deepEqual(result.items.map(item => item.weightedScore), [5, 18, 16, 24, 24, 0, 5]);
  assert.equal(result.totalWeightedScore, 92);
  assert.equal(result.classification, 'A');
});

test('classification owns every required Decimal boundary', () => {
  const classification = new BscClassificationService();
  for (const [score, grade] of [
    ['0', 'D'],
    ['69.99', 'D'],
    ['70', 'C'],
    ['79.99', 'C'],
    ['80', 'B'],
    ['89.99', 'B'],
    ['90', 'A'],
    ['100', 'A'],
    ['100.01', 'A+'],
    ['111', 'A+'],
    ['150', 'A+'],
  ] as const) {
    assert.equal(classification.classify(score), grade);
  }
});
