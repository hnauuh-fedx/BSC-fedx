import { describe, expect, it } from 'vitest';
import { planSubmissionError, validateKpiWeight } from './bsc-validation';

describe('BSC validation messages', () => {
  const items = [
    { id: 'kpi-1', weight: '60' },
    { id: 'kpi-2', weight: '30' },
  ];

  it('reports the resulting total when a new KPI would exceed 100%', () => {
    expect(validateKpiWeight(items, 20)).toBe('Tổng tỷ trọng sau khi lưu sẽ là 110%, không được vượt quá 100%.');
  });

  it('excludes the previous value when editing a KPI weight', () => {
    expect(validateKpiWeight(items, 40, 'kpi-2')).toBeNull();
    expect(validateKpiWeight(items, 50, 'kpi-2')).toBe('Tổng tỷ trọng sau khi lưu sẽ là 110%, không được vượt quá 100%.');
  });

  it('explains why a plan cannot be submitted', () => {
    expect(planSubmissionError([])).toBe('BSC phải có ít nhất một KPI trước khi gửi duyệt.');
    expect(planSubmissionError(items)).toBe('Tổng tỷ trọng hiện tại là 90%, còn thiếu 10%.');
    expect(planSubmissionError([{ id: 'bad', weight: Number.NaN }])).toBe('Mỗi KPI phải có tỷ trọng lớn hơn 0% và không vượt quá 100%.');
    expect(planSubmissionError([{ id: 'negative', weight: -10 }, { id: 'too-high', weight: 110 }])).toBe('Mỗi KPI phải có tỷ trọng lớn hơn 0% và không vượt quá 100%.');
  });
});
