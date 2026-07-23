import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, CalendarDaysIcon, ClipboardListIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { useAuth } from '../../auth/hooks/use-auth';
import { BscStatusBadge } from '../../employee-bsc/components/bsc-status-badge';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../organization/management-ui';
import { reportsApi } from '../reports-api';
import { DashboardData, ManagementDashboard, ReportRow } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => <Card size="sm">
  <CardHeader><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader>
</Card>;

const OfficialResult: React.FC<{ bsc: ReportRow }> = ({ bsc }) => bsc.evaluationStatus === 'APPROVED'
  ? <><Metric label="Điểm chính thức" value={bsc.officialScore ?? '—'}/><Metric label="Xếp loại chính thức" value={bsc.officialGrade ?? '—'}/></>
  : <Metric label="Kết quả chính thức" value="Chưa duyệt"/>;

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => { setLoading(true); setError(''); reportsApi.dashboard().then(setData).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải dashboard.')).finally(() => setLoading(false)); }, [reload]);
  return <main>
    <PageHeader title={`Xin chào, ${user?.fullName ?? 'bạn'}`} description="Tổng quan BSC theo quyền và phạm vi dữ liệu của bạn."/>
    {loading ? <LoadingState/> : error ? <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/> : !data ? <EmptyState/> : data.kind === 'EMPLOYEE' ? <EmployeeContent data={data}/> : <ManagementContent data={data}/>}
  </main>;
};

const EmployeeContent: React.FC<{ data: Extract<DashboardData, { kind: 'EMPLOYEE' }> }> = ({ data }) => <>
  <Card>
    <CardHeader>
      <CalendarDaysIcon aria-hidden="true"/>
      <CardTitle>Kỳ BSC hiện tại</CardTitle>
      <CardDescription>{data.currentCycle?.name ?? 'Chưa có kỳ BSC đang mở.'}</CardDescription>
      {data.currentBsc && <CardAction><Button asChild><Link to={`/employee-bsc/${data.currentBsc.id}`}>Mở BSC<ArrowRightIcon data-icon="inline-end"/></Link></Button></CardAction>}
    </CardHeader>
  </Card>
  {data.currentBsc ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Kế hoạch" value={<BscStatusBadge status={data.currentBsc.planStatus}/>}/><Metric label="Đánh giá kết quả" value={<BscStatusBadge status={data.currentBsc.evaluationStatus}/>}/><Metric label="Tổng tỷ trọng" value={`${data.currentBsc.totalWeight}%`}/><Metric label="Số KPI" value={data.currentBsc.kpiCount}/><OfficialResult bsc={data.currentBsc}/></div> : <EmptyState message="Bạn chưa có BSC trong kỳ hiện tại."/>}
  {data.actions.length > 0 && <Card><CardHeader><ClipboardListIcon aria-hidden="true"/><CardTitle>Việc cần xử lý</CardTitle><CardDescription>Các bước đang chờ bạn hoàn tất.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{data.actions.map(action => <Button key={action.code} variant="outline" asChild className="justify-between"><Link to={action.href}>{action.label}<ArrowRightIcon data-icon="inline-end"/></Link></Button>)}</CardContent></Card>}
  <Card><CardHeader><CardTitle>Lịch sử BSC gần đây</CardTitle><CardDescription>Các kỳ được cập nhật gần nhất.</CardDescription></CardHeader><CardContent>{data.recentBsc.length === 0 ? <EmptyState/> : <Table><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Mã BSC</TableHead><TableHead>Kế hoạch</TableHead><TableHead>Đánh giá kết quả</TableHead><TableHead>Điểm</TableHead><TableHead>Xếp loại</TableHead></TableRow></TableHeader><TableBody>{data.recentBsc.map(row => <TableRow key={row.id}><TableCell>{row.cycleName}</TableCell><TableCell><Link className="font-medium" to={`/employee-bsc/${row.id}`}>{row.bscCode}</Link></TableCell><TableCell><BscStatusBadge status={row.planStatus}/></TableCell><TableCell><BscStatusBadge status={row.evaluationStatus}/></TableCell><TableCell>{row.officialScore ?? '—'}</TableCell><TableCell>{row.officialGrade ?? '—'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
</>;

const ManagementContent: React.FC<{ data: ManagementDashboard }> = ({ data }) => <>
  <Card><CardHeader><CalendarDaysIcon aria-hidden="true"/><CardTitle>Kỳ hiện tại</CardTitle><CardDescription>{data.currentCycle?.name ?? 'Chưa có kỳ đang mở'}</CardDescription></CardHeader></Card>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Tổng số BSC" value={data.totalBsc}/><Metric label="Chưa tạo" value={data.notCreated}/><Metric label="BSC chờ duyệt" value={data.pendingPlanReviews + data.pendingEvaluationReviews}/><Metric label="Yêu cầu mở lại" value={data.pendingReopenRequests}/><Metric label="Điểm trung bình đã duyệt" value={data.approvedAverageScore ?? '—'}/></div>
  <div className="grid gap-6 lg:grid-cols-2"><StatusCounts title="Trạng thái kế hoạch" values={data.planStatusCounts}/><StatusCounts title="Trạng thái đánh giá" values={data.evaluationStatusCounts}/></div>
  <Card><CardHeader><CardTitle>Phân bố xếp loại</CardTitle><CardDescription>Chỉ bao gồm BSC đã duyệt đánh giá.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">{['C', 'B', 'A', 'A+', 'A++'].map(grade => <Metric key={grade} label={grade} value={data.gradeDistribution[grade] ?? 0}/>)}</CardContent></Card>
  <Card><CardHeader><CardTitle>Tiến độ theo phòng ban</CardTitle><CardDescription>Tỷ lệ BSC đã duyệt kết quả trên tổng số BSC.</CardDescription></CardHeader><CardContent>{data.departmentProgress.length === 0 ? <EmptyState/> : <Table><TableHeader><TableRow><TableHead>Phòng ban</TableHead><TableHead>Đã duyệt</TableHead><TableHead>Tổng BSC</TableHead><TableHead>Tiến độ</TableHead></TableRow></TableHeader><TableBody>{data.departmentProgress.map(row => <TableRow key={row.departmentId}><TableCell className="font-medium">{row.departmentName}</TableCell><TableCell>{row.approvedBsc}</TableCell><TableCell>{row.totalBsc}</TableCell><TableCell>{row.completionPercentage}%</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  <nav className="flex flex-wrap gap-3"><Button asChild><Link to="/management/bsc-reviews">Mở danh sách chờ duyệt<ArrowRightIcon data-icon="inline-end"/></Link></Button><Button variant="outline" asChild><Link to="/reports/bsc">Mở báo cáo chi tiết</Link></Button></nav>
</>;

const StatusCounts: React.FC<{ title: string; values: Record<string, number> }> = ({ title, values }) => <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Phân bố hồ sơ theo trạng thái workflow.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(values).map(([status, count]) => <Metric key={status} label={workflowStatusLabel(status)} value={count}/>)}</CardContent></Card>;
