import {
  ClipboardCheckIcon,
  FileSpreadsheetIcon,
  TargetIcon,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatReportScore } from '../report-format';
import { ReportSummary } from '../reports.types';

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = ({ label, value, description, icon: Icon }) => (
  <Card>
    <CardHeader>
      <CardDescription className="flex items-center gap-2"><Icon aria-hidden="true"/>{label}</CardDescription>
      <CardTitle>{value}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

export const BscReportMetrics: React.FC<{ summary: ReportSummary; isManagement: boolean }> = ({ summary, isManagement }) => {
  const approvedCount = summary.evaluationStatusCounts.APPROVED ?? 0;
  const pendingCount = summary.pendingPlanReviews + summary.pendingEvaluationReviews;

  return (
    <section className="grid grid-cols-4 gap-4" aria-label="Chỉ số tổng quan">
      <MetricCard label="Tổng số BSC" value={summary.totalBsc} description="Hồ sơ phù hợp với bộ lọc hiện tại." icon={FileSpreadsheetIcon}/>
      <MetricCard label="Đã duyệt đánh giá" value={approvedCount} description="Có điểm và xếp loại chính thức." icon={ClipboardCheckIcon}/>
      <MetricCard label="Điểm trung bình" value={formatReportScore(summary.approvedAverageScore)} description="Chỉ tính BSC đã duyệt EVALUATION." icon={TargetIcon}/>
      <MetricCard
        label={isManagement ? 'Đang chờ bạn xử lý' : 'BSC cần hoàn thiện'}
        value={isManagement ? pendingCount : (summary.planStatusCounts.DRAFT ?? 0) + (summary.evaluationStatusCounts.DRAFT ?? 0)}
        description={isManagement ? 'PLAN và EVALUATION đang chờ duyệt.' : 'Hồ sơ đang ở trạng thái nháp.'}
        icon={ClipboardCheckIcon}
      />
    </section>
  );
};
