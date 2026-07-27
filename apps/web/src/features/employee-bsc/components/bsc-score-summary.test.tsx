import React from 'react';
import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BscScoringPreview } from '../types/employee-bsc.types';
import { BscScoreSummary } from './bsc-score-summary';

const preview: BscScoringPreview = {
  bscId: 'bsc-1',
  planStatus: 'APPROVED',
  evaluationStatus: 'DRAFT',
  totalWeight: 100,
  scoredWeight: 100,
  totalWeightedScore: 97,
  isComplete: true,
  classification: 'A',
  items: [],
};

describe('BscScoreSummary', () => {
  it('groups the four score labels and values into compact, equal metric cells', () => {
    const { container } = render(<BscScoreSummary preview={preview} />);

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveAttribute('data-size', 'sm');

    const metrics = container.querySelector<HTMLElement>('[data-slot="score-metrics"]');
    expect(metrics).toHaveAccessibleName('Tóm tắt điểm BSC');
    if (!metrics) throw new Error('Score metrics container was not rendered');
    const cells = Array.from(
      metrics.querySelectorAll<HTMLElement>(':scope > [data-slot="score-metric"]'),
    );
    expect(cells).toHaveLength(4);

    expect(cells.map((cell) => ({
      labels: within(cell).getAllByRole('term').map((term) => term.textContent),
      values: within(cell).getAllByRole('definition').map((value) => value.textContent),
    }))).toEqual([
      { labels: ['Tổng trọng số'], values: ['100.00%'] },
      { labels: ['Trọng số đã có kết quả'], values: ['100.00%'] },
      { labels: ['Tổng điểm tạm tính'], values: ['97'] },
      { labels: ['Xếp loại dự kiến'], values: ['A'] },
    ]);
  });
});
