import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BscClassification, BscClassificationService, DecimalInput } from './bsc-classification.service';

export type ScoringReason =
  | 'ACTUAL_NOT_PROVIDED'
  | 'TARGET_NOT_PROVIDED'
  | 'TARGET_ZERO_NOT_SCORABLE'
  | 'ACTUAL_ZERO_NOT_SCORABLE'
  | 'BINARY_ACTUAL_INVALID'
  | 'CALCULATION_METHOD_UNSUPPORTED';

export interface BscScoringInput {
  itemId: string;
  calculationMethod: string;
  targetValue: DecimalInput | null;
  actualValue: DecimalInput | null;
  weight: DecimalInput;
}

export interface BscItemScoringResult {
  itemId: string;
  calculationMethod: string;
  target: number | null;
  actual: number | null;
  weight: number;
  isScorable: boolean;
  achievementPercentage: number | null;
  weightedScore: number | null;
  reason: ScoringReason | null;
}

export interface BscScoringResult {
  totalWeight: number;
  scoredWeight: number;
  totalWeightedScore: number;
  isComplete: boolean;
  classification: BscClassification | null;
  items: BscItemScoringResult[];
}

@Injectable()
export class BscScoringService {
  constructor(private readonly classification: BscClassificationService) {}

  scoreItem(input: BscScoringInput): BscItemScoringResult {
    const base = this.baseResult(input);
    const raw = this.calculateRaw(input);
    if (raw.reason) return this.unscorable(base, raw.reason);
    return this.scorable(base, raw.achievement!, raw.weighted!);
  }

  scoreBsc(inputs: BscScoringInput[]): BscScoringResult {
    const rawItems = inputs.map((input) => this.calculateRaw(input));
    const items = inputs.map((input, index) => {
      const base = this.baseResult(input);
      const raw = rawItems[index];
      return raw.reason ? this.unscorable(base, raw.reason) : this.scorable(base, raw.achievement!, raw.weighted!);
    });
    const totalWeight = inputs.reduce((sum, input) => sum.add(input.weight), new Prisma.Decimal(0));
    const scoredWeight = inputs.reduce((sum, input, index) => rawItems[index].reason ? sum : sum.add(input.weight), new Prisma.Decimal(0));
    const rawTotal = rawItems.reduce((sum, item) => item.weighted === null ? sum : sum.add(item.weighted), new Prisma.Decimal(0));
    const isComplete = items.length > 0 && totalWeight.eq(100) && items.every((item) => item.isScorable);

    return {
      totalWeight: this.toApiNumber(totalWeight),
      scoredWeight: this.toApiNumber(scoredWeight),
      totalWeightedScore: this.toApiNumber(rawTotal),
      isComplete,
      // Classification uses the unrounded Decimal total; API values are rounded only for transport.
      classification: isComplete ? this.classification.classify(rawTotal) : null,
      items,
    };
  }

  private calculateRaw(input: BscScoringInput): { reason: ScoringReason | null; achievement: Prisma.Decimal | null; weighted: Prisma.Decimal | null } {
    if (!['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY'].includes(input.calculationMethod)) {
      return { reason: 'CALCULATION_METHOD_UNSUPPORTED', achievement: null, weighted: null };
    }
    if (input.actualValue === null) return { reason: 'ACTUAL_NOT_PROVIDED', achievement: null, weighted: null };

    const actual = new Prisma.Decimal(input.actualValue);
    if (input.calculationMethod === 'BINARY') {
      if (!actual.eq(0) && !actual.eq(1)) return { reason: 'BINARY_ACTUAL_INVALID', achievement: null, weighted: null };
      const achievement = actual.eq(1) ? new Prisma.Decimal(100) : new Prisma.Decimal(0);
      return { reason: null, achievement, weighted: achievement.mul(input.weight).div(100) };
    }

    if (input.targetValue === null) return { reason: 'TARGET_NOT_PROVIDED', achievement: null, weighted: null };
    const target = new Prisma.Decimal(input.targetValue);
    if (target.eq(0)) return { reason: 'TARGET_ZERO_NOT_SCORABLE', achievement: null, weighted: null };
    if (input.calculationMethod === 'TARGET_DIV_ACTUAL' && actual.eq(0)) {
      return { reason: 'ACTUAL_ZERO_NOT_SCORABLE', achievement: null, weighted: null };
    }

    const achievement = input.calculationMethod === 'ACTUAL_DIV_TARGET'
      ? actual.div(target).mul(100)
      : target.div(actual).mul(100);
    return { reason: null, achievement, weighted: achievement.mul(input.weight).div(100) };
  }

  private baseResult(input: BscScoringInput): Omit<BscItemScoringResult, 'isScorable' | 'achievementPercentage' | 'weightedScore' | 'reason'> {
    return {
      itemId: input.itemId,
      calculationMethod: input.calculationMethod,
      target: input.targetValue === null ? null : this.toApiNumber(new Prisma.Decimal(input.targetValue)),
      actual: input.actualValue === null ? null : this.toApiNumber(new Prisma.Decimal(input.actualValue)),
      weight: this.toApiNumber(new Prisma.Decimal(input.weight)),
    };
  }

  private unscorable(base: ReturnType<BscScoringService['baseResult']>, reason: ScoringReason): BscItemScoringResult {
    return { ...base, isScorable: false, achievementPercentage: null, weightedScore: null, reason };
  }

  private scorable(base: ReturnType<BscScoringService['baseResult']>, achievement: Prisma.Decimal, weighted: Prisma.Decimal): BscItemScoringResult {
    return {
      ...base,
      isScorable: true,
      achievementPercentage: this.toApiNumber(achievement),
      weightedScore: this.toApiNumber(weighted),
      reason: null,
    };
  }

  private toApiNumber(value: Prisma.Decimal): number {
    return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }
}
