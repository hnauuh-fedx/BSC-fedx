import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/use-auth';
import { BscStatusBadge } from '../../employee-bsc/components/bsc-status-badge';
import { EmptyState, ErrorState, LoadingState } from '../../organization/management-ui';
import { reportsApi } from '../reports-api';
import { DashboardData, ManagementDashboard, ReportRow } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => <article className="rounded-xl border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></article>;
const OfficialResult: React.FC<{ bsc: ReportRow }> = ({ bsc }) => bsc.evaluationStatus === 'APPROVED'
  ? <><Metric label="Điểm chính thức" value={bsc.officialScore ?? '—'}/><Metric label="Xếp loại chính thức" value={bsc.officialGrade ?? '—'}/></>
  : <Metric label="Kết quả chính thức" value="Chưa được duyệt"/>;

export const DashboardPage: React.FC = () => {
  const { user } = useAuth(); const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => { setLoading(true); setError(''); reportsApi.dashboard().then(setData).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải dashboard.')).finally(() => setLoading(false)); }, [reload]);
  return <main className="space-y-6">
    <header><p className="text-sm text-muted-foreground">Tổng quan BSC theo quyền và phạm vi dữ liệu</p><h1 className="text-3xl font-semibold">Dashboard</h1><h2 className="mt-1 text-lg">Xin chào, {user?.fullName}</h2></header>
    {loading ? <LoadingState/> : error ? <div><ErrorState error={error}/><button onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : !data ? <EmptyState/> : data.kind === 'EMPLOYEE' ? <EmployeeContent data={data}/> : <ManagementContent data={data}/>}
  </main>;
};

const EmployeeContent: React.FC<{ data: Extract<DashboardData, { kind: 'EMPLOYEE' }> }> = ({ data }) => <>
  <section><h2 className="mb-3 text-xl font-semibold">Kỳ BSC hiện tại</h2>{data.currentCycle ? <p>{data.currentCycle.name}</p> : <EmptyState message="Chưa có kỳ BSC đang mở."/>}</section>
  {data.currentBsc ? <><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="PLAN" value={<BscStatusBadge status={data.currentBsc.planStatus}/>}/><Metric label="EVALUATION" value={<BscStatusBadge status={data.currentBsc.evaluationStatus}/>}/><Metric label="Tổng tỷ trọng" value={`${data.currentBsc.totalWeight}%`}/><Metric label="Số KPI" value={data.currentBsc.kpiCount}/><OfficialResult bsc={data.currentBsc}/></section><p><Link className="underline" to={`/employee-bsc/${data.currentBsc.id}`}>Mở BSC hiện tại</Link></p></> : <EmptyState message="Bạn chưa có BSC trong kỳ hiện tại."/>}
  {data.actions.length > 0 && <section><h2 className="mb-2 text-xl font-semibold">Việc cần xử lý</h2>{data.actions.map(action => <p key={action.code}><Link className="underline" to={action.href}>{action.label}</Link></p>)}</section>}
  <section><h2 className="mb-3 text-xl font-semibold">Lịch sử BSC gần đây</h2>{data.recentBsc.length === 0 ? <EmptyState/> : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th>Kỳ</th><th>Mã BSC</th><th>PLAN</th><th>EVALUATION</th><th>Điểm</th><th>Xếp loại</th></tr></thead><tbody>{data.recentBsc.map(row => <tr key={row.id}><td>{row.cycleName}</td><td><Link className="underline" to={`/employee-bsc/${row.id}`}>{row.bscCode}</Link></td><td>{workflowStatusLabel(row.planStatus)}</td><td>{workflowStatusLabel(row.evaluationStatus)}</td><td>{row.officialScore ?? '—'}</td><td>{row.officialGrade ?? '—'}</td></tr>)}</tbody></table></div>}</section>
</>;

const ManagementContent: React.FC<{ data: ManagementDashboard }> = ({ data }) => <>
  <p>Kỳ hiện tại: <strong>{data.currentCycle?.name ?? 'Chưa có kỳ đang mở'}</strong></p>
  <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Tổng số BSC" value={data.totalBsc}/><Metric label="Chưa tạo" value={data.notCreated}/><Metric label="BSC chờ duyệt" value={data.pendingPlanReviews + data.pendingEvaluationReviews}/><Metric label="Yêu cầu mở lại đang chờ" value={data.pendingReopenRequests}/><Metric label="Điểm trung bình đã duyệt" value={data.approvedAverageScore ?? '—'}/></section>
  <section className="grid gap-6 lg:grid-cols-2"><StatusCounts title="Trạng thái PLAN" values={data.planStatusCounts}/><StatusCounts title="Trạng thái EVALUATION" values={data.evaluationStatusCounts}/></section>
  <section><h2 className="mb-3 text-xl font-semibold">Phân bố xếp loại (đã duyệt)</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{['C', 'B', 'A', 'A+', 'A++'].map(grade => <Metric key={grade} label={grade} value={data.gradeDistribution[grade] ?? 0}/>)}</div></section>
  <section><h2 className="mb-3 text-xl font-semibold">Tiến độ theo phòng ban</h2>{data.departmentProgress.length === 0 ? <EmptyState/> : <table className="w-full"><thead><tr><th>Phòng ban</th><th>Đã duyệt</th><th>Tổng BSC</th><th>Tiến độ</th></tr></thead><tbody>{data.departmentProgress.map(row => <tr key={row.departmentId}><td>{row.departmentName}</td><td>{row.approvedBsc}</td><td>{row.totalBsc}</td><td>{row.completionPercentage}%</td></tr>)}</tbody></table>}</section>
  <nav className="flex gap-4"><Link className="underline" to="/management/bsc-reviews">Mở danh sách chờ duyệt</Link><Link className="underline" to="/reports/bsc">Mở báo cáo chi tiết</Link></nav>
</>;

const StatusCounts: React.FC<{ title: string; values: Record<string, number> }> = ({ title, values }) => <section><h2 className="mb-3 text-xl font-semibold">{title}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(values).map(([status, count]) => <Metric key={status} label={workflowStatusLabel(status)} value={count}/>)}</div></section>;
