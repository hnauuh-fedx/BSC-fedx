import { BadRequestException } from '@nestjs/common';

export function assertValidWeight(weight: number): void {
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    throw new BadRequestException({ code: 'BSC_WEIGHT_INVALID', message: 'Trọng số phải lớn hơn 0 và không vượt quá 100.' });
  }
}

export function assertTotalWeight(total: number): void {
  if (!Number.isFinite(total) || total > 100) {
    throw new BadRequestException({ code: 'BSC_TOTAL_WEIGHT_EXCEEDED', message: 'Tổng trọng số KPI không được vượt quá 100.' });
  }
}

export function assertTargetCompatible(calculationMethod: string, targetValue: number | undefined): void {
  if (calculationMethod === 'ACTUAL_DIV_TARGET' && targetValue === 0) {
    throw new BadRequestException({ code: 'BSC_TARGET_INVALID', message: 'Chỉ tiêu phải khác 0 với phương pháp kết quả chia chỉ tiêu.' });
  }
}
