import React from 'react';
import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { BscScoringPreview } from '../types/employee-bsc.types';
import { formatBscScore } from '../utils/format-bsc-score';

const ScoreMetric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div
    data-slot="score-metric"
    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 rounded-lg bg-muted/40 px-3 py-2"
  >
    <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
    <dd className="m-0 text-right text-base font-semibold tabular-nums">{value}</dd>
  </div>
);

export const BscScoreSummary: React.FC<{ preview: BscScoringPreview; isOfficial?: boolean }> = ({
  preview,
  isOfficial = false,
}) => (
  <Card size="sm" className="mt-4" aria-labelledby="preview-score-title">
    <CardHeader>
      <CardTitle>
        <h2 id="preview-score-title" className="m-0 text-base">
          {isOfficial ? 'Điểm chính thức' : 'Điểm dự kiến'}
        </h2>
      </CardTitle>
      <CardDescription>
        {isOfficial
          ? 'Kết quả đã được duyệt và khóa.'
          : 'Điểm chỉ trở thành chính thức sau khi đánh giá được duyệt.'}
      </CardDescription>
      <CardAction>
        <Badge variant={isOfficial ? 'default' : 'secondary'}>
          {isOfficial ? 'Đã duyệt' : 'Dự kiến'}
        </Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="grid gap-2">
      <dl
        data-slot="score-metrics"
        aria-label="Tóm tắt điểm BSC"
        className="m-0 grid grid-cols-4 gap-3"
      >
        <ScoreMetric label="Tổng trọng số" value={`${preview.totalWeight.toFixed(2)}%`} />
        <ScoreMetric
          label="Trọng số đã có kết quả"
          value={`${preview.scoredWeight.toFixed(2)}%`}
        />
        <ScoreMetric
          label={isOfficial ? 'Tổng điểm chính thức' : 'Tổng điểm tạm tính'}
          value={formatBscScore(preview.totalWeightedScore)}
        />
        <ScoreMetric
          label={isOfficial ? 'Xếp loại chính thức' : 'Xếp loại dự kiến'}
          value={preview.isComplete ? preview.classification : 'Chưa đủ dữ liệu'}
        />
      </dl>
      {!preview.isComplete && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          BSC chưa đủ dữ liệu để xác định xếp loại {isOfficial ? 'chính thức' : 'dự kiến'}.
        </p>
      )}
    </CardContent>
  </Card>
);
