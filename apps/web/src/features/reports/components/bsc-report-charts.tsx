import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { BSC_STAGE_LABELS } from '@/lib/bsc-stage';
import { EmptyState } from '../../organization/management-ui';
import { formatReportScore, reportScoreNumber } from '../report-format';
import { ReportSummary } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const WORKFLOW_STATUSES = ['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'] as const;

const scoreConfig = {
  score: { label: 'Điểm trung bình', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const gradeConfig = {
  count: { label: 'Số BSC', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const workflowConfig = {
  plan: { label: BSC_STAGE_LABELS.PLAN, color: 'var(--chart-1)' },
  evaluation: { label: BSC_STAGE_LABELS.EVALUATION, color: 'var(--chart-3)' },
} satisfies ChartConfig;

const departmentConfig = {
  completion: { label: 'Tỷ lệ hoàn thành', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const ChartCardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <CardTitle><h2>{children}</h2></CardTitle>
);

const ScoreTrendChart: React.FC<{ summary: ReportSummary }> = ({ summary }) => {
  const data = summary.scoreTrend
    .filter(point => point.approvedAverageScore !== null)
    .map(point => ({
      cycle: point.cycleName,
      score: reportScoreNumber(point.approvedAverageScore),
      approved: point.approvedCount,
    }));

  return (
    <Card className="col-span-2">
      <CardHeader>
        <ChartCardTitle>Xu hướng điểm BSC</ChartCardTitle>
        <CardDescription>Điểm trung bình của tối đa 12 kỳ có đánh giá đã duyệt, trong cùng phạm vi dữ liệu.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <EmptyState message="Chưa có điểm đã duyệt để hiển thị xu hướng."/> : (
          <ChartContainer config={scoreConfig} className="h-[300px] w-full" aria-label="Biểu đồ xu hướng điểm BSC">
            <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 16, top: 12 }}>
              <CartesianGrid vertical={false}/>
              <XAxis dataKey="cycle" tickLine={false} axisLine={false} tickMargin={10}/>
              <YAxis tickLine={false} axisLine={false} width={36}/>
              <ChartTooltip
                content={<ChartTooltipContent formatter={value => formatReportScore(String(value))}/>}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--color-score)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-score)', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

const GradeDistributionChart: React.FC<{ summary: ReportSummary }> = ({ summary }) => {
  const data = Object.entries(summary.gradeDistribution).map(([grade, count]) => ({ grade, count }));
  const hasData = data.some(item => item.count > 0);

  return (
    <Card>
      <CardHeader>
        <ChartCardTitle>Phân bố xếp loại</ChartCardTitle>
        <CardDescription>Chỉ sử dụng đánh giá đã duyệt.</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? <EmptyState message="Chưa có xếp loại đã duyệt."/> : (
          <ChartContainer config={gradeConfig} className="h-[300px] w-full" aria-label="Biểu đồ phân bố xếp loại">
            <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid horizontal={false}/>
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false}/>
              <YAxis dataKey="grade" type="category" tickLine={false} axisLine={false} width={34}/>
              <ChartTooltip content={<ChartTooltipContent hideLabel/>}/>
              <Bar dataKey="count" fill="var(--color-count)" radius={4}/>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

const WorkflowChart: React.FC<{ summary: ReportSummary }> = ({ summary }) => {
  const data = WORKFLOW_STATUSES.map(status => ({
    status: workflowStatusLabel(status),
    plan: summary.planStatusCounts[status] ?? 0,
    evaluation: summary.evaluationStatusCounts[status] ?? 0,
  })).filter(item => item.plan > 0 || item.evaluation > 0);

  return (
    <Card>
      <CardHeader>
        <ChartCardTitle>Trạng thái kế hoạch và đánh giá</ChartCardTitle>
        <CardDescription>So sánh số hồ sơ ở từng trạng thái của hai giai đoạn duyệt.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <EmptyState message="Chưa có dữ liệu workflow."/> : (
          <ChartContainer config={workflowConfig} className="h-[320px] w-full" aria-label="Biểu đồ trạng thái kế hoạch và đánh giá">
            <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
              <CartesianGrid vertical={false}/>
              <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={10}/>
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false}/>
              <ChartTooltip content={<ChartTooltipContent/>}/>
              <ChartLegend content={<ChartLegendContent/>}/>
              <Bar dataKey="plan" fill="var(--color-plan)" radius={4}/>
              <Bar dataKey="evaluation" fill="var(--color-evaluation)" radius={4}/>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

const DepartmentProgressChart: React.FC<{ summary: ReportSummary }> = ({ summary }) => {
  const data = summary.departmentProgress.map(item => ({
    department: item.departmentName,
    completion: item.completionPercentage,
    approved: item.approvedBsc,
    total: item.totalBsc,
  }));
  const chartHeight = Math.max(260, data.length * 44);

  return (
    <Card>
      <CardHeader>
        <ChartCardTitle>Tiến độ phê duyệt theo phòng ban</ChartCardTitle>
        <CardDescription>Tỷ lệ BSC có đánh giá đã duyệt trên tổng số hồ sơ của từng phòng ban.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.length === 0 ? <EmptyState message="Chưa có dữ liệu tiến độ phòng ban."/> : (
          <>
            <div className="max-h-[420px] overflow-y-auto">
              <ChartContainer
                config={departmentConfig}
                className="w-full"
                style={{ height: chartHeight }}
                aria-label="Biểu đồ tiến độ phê duyệt theo phòng ban"
              >
                <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid horizontal={false}/>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} tickLine={false} axisLine={false}/>
                  <YAxis dataKey="department" type="category" tickLine={false} axisLine={false} width={110}/>
                  <ChartTooltip content={<ChartTooltipContent hideLabel/>}/>
                  <Bar dataKey="completion" fill="var(--color-completion)" radius={4}/>
                </BarChart>
              </ChartContainer>
            </div>
            <Separator/>
            <div className="flex flex-col gap-4" aria-label="Chi tiết tiến độ phòng ban">
              {summary.departmentProgress.map(item => (
                <div key={item.departmentId} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <span>{item.departmentName}</span>
                    <span className="text-muted-foreground">{item.approvedBsc}/{item.totalBsc} · {item.completionPercentage}%</span>
                  </div>
                  <Progress value={item.completionPercentage} aria-label={`${item.departmentName}: ${item.completionPercentage}%`}/>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export const BscReportCharts: React.FC<{ summary: ReportSummary; isManagement: boolean }> = ({ summary, isManagement }) => (
  <div className="grid grid-cols-3 gap-6">
    <ScoreTrendChart summary={summary}/>
    <GradeDistributionChart summary={summary}/>
    <div className={cn(!isManagement && 'col-span-3')}>
      <WorkflowChart summary={summary}/>
    </div>
    {isManagement && (
      <div className="col-span-2">
        <DepartmentProgressChart summary={summary}/>
      </div>
    )}
  </div>
);
