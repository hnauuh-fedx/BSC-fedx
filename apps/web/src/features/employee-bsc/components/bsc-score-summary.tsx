import React from 'react';
import { BscScoringPreview } from '../types/employee-bsc.types';

export const BscScoreSummary: React.FC<{ preview: BscScoringPreview }> = ({ preview }) => <section>
  <h2>Điểm dự kiến</h2>
  <dl>
    <dt>Tổng trọng số</dt><dd>{preview.totalWeight.toFixed(2)}%</dd>
    <dt>Trọng số đã có kết quả</dt><dd>{preview.scoredWeight.toFixed(2)}%</dd>
    <dt>Tổng điểm tạm tính</dt><dd>{preview.totalWeightedScore.toFixed(4)}</dd>
    <dt>Xếp loại dự kiến</dt><dd>{preview.isComplete ? preview.classification : 'Chưa đủ dữ liệu'}</dd>
  </dl>
  {!preview.isComplete && <p>Điểm hiện tại chỉ là tạm tính. BSC chưa đủ dữ liệu để xếp loại.</p>}
</section>;
