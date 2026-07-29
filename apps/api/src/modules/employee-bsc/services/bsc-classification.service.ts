import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const BSC_CLASSIFICATIONS = ['D', 'C', 'B', 'A', 'A+'] as const;
export type BscClassification = (typeof BSC_CLASSIFICATIONS)[number];
export type DecimalInput = Prisma.Decimal | string | number;

@Injectable()
export class BscClassificationService {
  classify(score: DecimalInput): BscClassification {
    const value = new Prisma.Decimal(score);
    if (value.lt(70)) return 'D';
    if (value.lt(80)) return 'C';
    if (value.lt(90)) return 'B';
    if (value.lte(100)) return 'A';
    return 'A+';
  }
}
