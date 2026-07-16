import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/use-auth';
import { EmptyState, ErrorState, LoadingState, Pagination, SearchInput } from '../../organization/management-ui';
import { reportsApi } from '../reports-api';
import { ReportOptions, ReportRow } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const PAGE_SIZE = 20;
const date = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
const statuses = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'];

export const BscReportPage: React.FC = () => {
  const { user } = useAuth(); const [options, setOptions] = useState<ReportOptions | null>(null), [items, setItems] = useState<ReportRow[]>([]);
  const [cycleId, setCycleId] = useState(''), [departmentId, setDepartmentId] = useState(''), [employeeId, setEmployeeId] = useState('');
  const [planStatus, setPlanStatus] = useState(''), [evaluationStatus, setEvaluationStatus] = useState(''), [finalGrade, setFinalGrade] = useState(''), [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at'), [sortOrder, setSortOrder] = useState('desc'), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0), [exporting, setExporting] = useState(false);
  const filters = useMemo(() => ({ cycleId, departmentId, employeeId, planStatus, evaluationStatus, finalGrade, search, sortBy, sortOrder }), [cycleId, departmentId, employeeId, planStatus, evaluationStatus, finalGrade, search, sortBy, sortOrder]);
  useEffect(() => { reportsApi.options().then(setOptions).catch(() => undefined); }, []);
  useEffect(() => { setLoading(true); setError(''); reportsApi.list({ ...filters, page, limit: PAGE_SIZE }).then(result => { setItems(result.items); setTotal(result.total); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo BSC.')).finally(() => setLoading(false)); }, [filters, page, reload]);
  const change = (setter: React.Dispatch<React.SetStateAction<string>>) => (event: React.ChangeEvent<HTMLSelectElement>) => { setter(event.target.value); setPage(1); };
  const exportExcel = async () => { setExporting(true); setError(''); try { const result = await reportsApi.export(filters); const url = URL.createObjectURL(result.blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName; anchor.click(); URL.revokeObjectURL(url); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xuất Excel.'); } finally { setExporting(false); } };
  return <main className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Dữ liệu được giới hạn theo quyền và phạm vi backend</p><h1 className="text-3xl font-semibold">Báo cáo BSC</h1></div>{user?.permissions.includes('bsc.report.export') && <button type="button" disabled={exporting} onClick={() => void exportExcel()}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button>}</header>
    <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
      <label>Kỳ BSC<select value={cycleId} onChange={change(setCycleId)}><option value="">Tất cả kỳ</option>{options?.cycles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Phòng ban<select value={departmentId} onChange={change(setDepartmentId)}><option value="">Tất cả phòng ban</option>{options?.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Nhân viên<select value={employeeId} onChange={change(setEmployeeId)}><option value="">Tất cả nhân viên</option>{options?.employees.map(item => <option key={item.id} value={item.id}>{item.employee_code} — {item.full_name}</option>)}</select></label>
      <label>Trạng thái PLAN<select value={planStatus} onChange={change(setPlanStatus)}><option value="">Tất cả</option>{statuses.map(value => <option key={value} value={value}>{workflowStatusLabel(value)}</option>)}</select></label>
      <label>Trạng thái EVALUATION<select value={evaluationStatus} onChange={change(setEvaluationStatus)}><option value="">Tất cả</option>{['NOT_STARTED', ...statuses].map(value => <option key={value} value={value}>{workflowStatusLabel(value)}</option>)}</select></label>
      <label>Xếp loại<select value={finalGrade} onChange={change(setFinalGrade)}><option value="">Tất cả</option>{['C', 'B', 'A', 'A+', 'A++'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Sắp xếp<select value={sortBy} onChange={change(setSortBy)}><option value="created_at">Ngày tạo</option><option value="final_score">Điểm cuối</option><option value="plan_approved_at">Ngày duyệt PLAN</option><option value="evaluation_approved_at">Ngày duyệt EVALUATION</option></select></label>
      <label>Thứ tự<select value={sortOrder} onChange={change(setSortOrder)}><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option></select></label>
      <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
    </section>
    {error && <div><ErrorState error={error}/><button onClick={() => setReload(value => value + 1)}>Thử lại</button></div>}
    {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message="Không có dữ liệu BSC phù hợp."/> : !error && <div className="overflow-x-auto"><table className="min-w-[1400px] w-full"><thead><tr><th>Mã nhân viên</th><th>Họ tên / BSC</th><th>Phòng ban</th><th>Chức danh</th><th>Quản lý trực tiếp</th><th>Kỳ BSC</th><th>PLAN</th><th>EVALUATION</th><th>Tổng tỷ trọng</th><th>Số KPI</th><th>Final score</th><th>Final grade</th><th>Duyệt PLAN</th><th>Duyệt EVALUATION</th></tr></thead><tbody>{items.map(row => <tr key={row.id}><td>{row.employeeCode}</td><td>{row.employeeName}<br/><Link className="underline" to={`/employee-bsc/${row.id}`}>{row.bscCode}</Link></td><td>{row.departmentName}</td><td>{row.positionName}</td><td>{row.directManagerName}</td><td>{row.cycleName}</td><td>{workflowStatusLabel(row.planStatus)}</td><td>{workflowStatusLabel(row.evaluationStatus)}</td><td>{row.totalWeight}%</td><td>{row.kpiCount}</td><td>{row.officialScore ?? '—'}</td><td>{row.officialGrade ?? '—'}</td><td>{date(row.planApprovedAt)}</td><td>{date(row.evaluationApprovedAt)}</td></tr>)}</tbody></table></div>}
    <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage}/>
  </main>;
};
