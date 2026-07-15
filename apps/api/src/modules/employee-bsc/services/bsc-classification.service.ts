import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type BscClassification = 'C' | 'B' | 'A' | 'A+' | 'A++';
export type DecimalInput = Prisma.Decimal | string | number;

@Injectable()
export class BscClassificationService {
  classify(score: DecimalInput): BscClassification {
    const value = new Prisma.Decimal(score);
    if (value.lt(80)) return 'C';
    if (value.lt(90)) return 'B';
    if (value.lte(100)) return 'A';
    if (value.lt(111)) return 'A+';
    return 'A++';
  }
}
