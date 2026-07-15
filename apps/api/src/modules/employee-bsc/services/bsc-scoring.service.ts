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
  reason: ScoringReason | null;
  rawAchievementPercentage: number | null;
  roundedAchievementPercentage: number | null;
  rawWorkScore: number | null;
  roundedWorkScore: number | null;
  weightedScore: number | null;
}

export interface BscScoringResult {
  totalWeight: number;
  scoredWeight: number;
  totalWeightedScore: number;
  isComplete: boolean;
  classification: BscClassification | null;
  items: BscItemScoringResult[];
  /** Exact domain value for persistence/classification; never expose this as the HTTP transport field. */
  canonicalTotalWeightedScore: Prisma.Decimal;
}

interface RawScoringResult {
  reason: ScoringReason | null;
  rawAchievement: Prisma.Decimal | null;
  rawWorkScore: Prisma.Decimal | null;
  roundedAchievement: Prisma.Decimal | null;
  roundedWorkScore: Prisma.Decimal | null;
  weightedScore: Prisma.Decimal | null;
}

@Injectable()
export class BscScoringService {
  constructor(private readonly classification: BscClassificationService) {}

  scoreItem(input: BscScoringInput): BscItemScoringResult {
    const raw = this.calculateRaw(input);
    return this.toItemResult(input, raw);
  }

  scoreBsc(inputs: BscScoringInput[]): BscScoringResult {
    const rawItems = inputs.map((input) => this.calculateRaw(input));
    const items = inputs.map((input, index) => this.toItemResult(input, rawItems[index]));
    const totalWeight = inputs.reduce((sum, input) => sum.add(input.weight), new Prisma.Decimal(0));
    const scoredWeight = inputs.reduce(
      (sum, input, index) => rawItems[index].reason ? sum : sum.add(input.weight),
      new Prisma.Decimal(0),
    );
    const exactTotal = rawItems.reduce(
      (sum, item) => item.weightedScore === null ? sum : sum.add(item.weightedScore),
      new Prisma.Decimal(0),
    );
    const isComplete = items.length > 0 && totalWeight.eq(100) && items.every((item) => item.isScorable);

    return {
      totalWeight: this.toApiNumber(totalWeight),
      scoredWeight: this.toApiNumber(scoredWeight),
      totalWeightedScore: this.toApiNumber(exactTotal),
      isComplete,
      // The grade uses the exact Decimal total, never the rounded transport value.
      classification: isComplete ? this.classification.classify(exactTotal) : null,
      items,
      canonicalTotalWeightedScore: exactTotal,
    };
  }

  roundAchievementPercentage(rawAchievement: DecimalInput): number {
    return this.toApiNumber(this.roundAchievementDecimal(new Prisma.Decimal(rawAchievement)));
  }

  roundWorkScore(rawWorkScore: DecimalInput): number {
    return this.toApiNumber(this.roundWorkScoreDecimal(new Prisma.Decimal(rawWorkScore)));
  }

  calculateWeightedScore(roundedWorkScore: DecimalInput, weight: DecimalInput): number {
    return this.toApiNumber(this.weightedScoreDecimal(new Prisma.Decimal(roundedWorkScore), new Prisma.Decimal(weight)));
  }

  alignRawScores(rawAchievement: DecimalInput, rawWorkScore: DecimalInput, weight: DecimalInput) {
    const achievement = new Prisma.Decimal(rawAchievement);
    const workScore = new Prisma.Decimal(rawWorkScore);
    const roundedAchievement = this.roundAchievementDecimal(achievement);
    const roundedWorkScore = this.roundWorkScoreDecimal(workScore);
    return {
      rawAchievementPercentage: this.toApiNumber(achievement),
      roundedAchievementPercentage: this.toApiNumber(roundedAchievement),
      rawWorkScore: this.toApiNumber(workScore),
      roundedWorkScore: this.toApiNumber(roundedWorkScore),
      weightedScore: this.toApiNumber(this.weightedScoreDecimal(roundedWorkScore, new Prisma.Decimal(weight))),
    };
  }

  private calculateRaw(input: BscScoringInput): RawScoringResult {
    if (!['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY'].includes(input.calculationMethod)) {
      return this.unscorableRaw('CALCULATION_METHOD_UNSUPPORTED');
    }
    if (input.actualValue === null) return this.unscorableRaw('ACTUAL_NOT_PROVIDED');

    const actual = new Prisma.Decimal(input.actualValue);
    let rawAchievement: Prisma.Decimal;
    if (input.calculationMethod === 'BINARY') {
      if (!actual.eq(0) && !actual.eq(1)) return this.unscorableRaw('BINARY_ACTUAL_INVALID');
      rawAchievement = actual.eq(1) ? new Prisma.Decimal(100) : new Prisma.Decimal(0);
    } else {
      if (input.targetValue === null) return this.unscorableRaw('TARGET_NOT_PROVIDED');
      const target = new Prisma.Decimal(input.targetValue);
      if (target.eq(0)) return this.unscorableRaw('TARGET_ZERO_NOT_SCORABLE');
      if (input.calculationMethod === 'TARGET_DIV_ACTUAL' && actual.eq(0)) {
        return this.unscorableRaw('ACTUAL_ZERO_NOT_SCORABLE');
      }
      rawAchievement = input.calculationMethod === 'ACTUAL_DIV_TARGET'
        ? actual.div(target).mul(100)
        : target.div(actual).mul(100);
    }

    const rawWorkScore = this.calculateRawWorkScore(rawAchievement);
    const roundedAchievement = this.roundAchievementDecimal(rawAchievement);
    const roundedWorkScore = this.roundWorkScoreDecimal(rawWorkScore);
    const weightedScore = this.weightedScoreDecimal(roundedWorkScore, new Prisma.Decimal(input.weight));
    return { reason: null, rawAchievement, rawWorkScore, roundedAchievement, roundedWorkScore, weightedScore };
  }

  /**
   * Canonical pre-3B.4 scoring used the raw completion rate as the unweighted work score.
   * Keeping this as a separate domain seam prevents either rounding path from depending on
   * the other and allows the business formula to be replaced once separately confirmed.
   */
  private calculateRawWorkScore(rawAchievement: Prisma.Decimal): Prisma.Decimal {
    return new Prisma.Decimal(rawAchievement);
  }

  private roundAchievementDecimal(rawAchievement: Prisma.Decimal): Prisma.Decimal {
    return rawAchievement.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  }

  private roundWorkScoreDecimal(rawWorkScore: Prisma.Decimal): Prisma.Decimal {
    return rawWorkScore.div(10).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(10);
  }

  private weightedScoreDecimal(roundedWorkScore: Prisma.Decimal, weight: Prisma.Decimal): Prisma.Decimal {
    return roundedWorkScore.mul(weight).div(100);
  }

  private unscorableRaw(reason: ScoringReason): RawScoringResult {
    return {
      reason,
      rawAchievement: null,
      rawWorkScore: null,
      roundedAchievement: null,
      roundedWorkScore: null,
      weightedScore: null,
    };
  }

  private toItemResult(input: BscScoringInput, raw: RawScoringResult): BscItemScoringResult {
    const base = {
      itemId: input.itemId,
      calculationMethod: input.calculationMethod,
      target: input.targetValue === null ? null : this.toApiNumber(new Prisma.Decimal(input.targetValue)),
      actual: input.actualValue === null ? null : this.toApiNumber(new Prisma.Decimal(input.actualValue)),
      weight: this.toApiNumber(new Prisma.Decimal(input.weight)),
    };
    if (raw.reason) {
      return {
        ...base,
        isScorable: false,
        reason: raw.reason,
        rawAchievementPercentage: null,
        roundedAchievementPercentage: null,
        rawWorkScore: null,
        roundedWorkScore: null,
        weightedScore: null,
      };
    }
    return {
      ...base,
      isScorable: true,
      reason: null,
      rawAchievementPercentage: this.toApiNumber(raw.rawAchievement!),
      roundedAchievementPercentage: this.toApiNumber(raw.roundedAchievement!),
      rawWorkScore: this.toApiNumber(raw.rawWorkScore!),
      roundedWorkScore: this.toApiNumber(raw.roundedWorkScore!),
      weightedScore: this.toApiNumber(raw.weightedScore!),
    };
  }

  private toApiNumber(value: Prisma.Decimal): number {
    return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }
}
