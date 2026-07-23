import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DownloadIcon, RotateCcwIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { useAuth } from '../../auth/hooks/use-auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { BscStatusBadge } from '../../employee-bsc/components/bsc-status-badge';
import { reportsApi } from '../reports-api';
import { ReportOptions, ReportRow } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const PAGE_SIZE = 20;
const ALL = 'ALL';
const date = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
const statuses = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'];

const FilterSelect: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ id, label, value, onChange, options }) => <Field>
  <FieldLabel htmlFor={id}>{label}</FieldLabel>
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger id={id}><SelectValue/></SelectTrigger>
    <SelectContent><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
</Field>;

export const BscReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [items, setItems] = useState<ReportRow[]>([]);
  const [cycleId, setCycleId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);
  const [planStatus, setPlanStatus] = useState(ALL);
  const [evaluationStatus, setEvaluationStatus] = useState(ALL);
  const [finalGrade, setFinalGrade] = useState(ALL);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(() => ({
    cycleId: cycleId === ALL ? '' : cycleId,
    departmentId: departmentId === ALL ? '' : departmentId,
    employeeId: employeeId === ALL ? '' : employeeId,
    planStatus: planStatus === ALL ? '' : planStatus,
    evaluationStatus: evaluationStatus === ALL ? '' : evaluationStatus,
    finalGrade: finalGrade === ALL ? '' : finalGrade,
    search,
    sortBy,
    sortOrder,
  }), [cycleId, departmentId, employeeId, planStatus, evaluationStatus, finalGrade, search, sortBy, sortOrder]);

  useEffect(() => { reportsApi.options().then(setOptions).catch(() => undefined); }, []);
  useEffect(() => {
    setLoading(true);
    setError('');
    setItems([]);
    reportsApi.list({ ...filters, page, limit: PAGE_SIZE })
      .then(result => { setItems(result.items); setTotal(result.total); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo BSC.'))
      .finally(() => setLoading(false));
  }, [filters, page, reload]);

  const change = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const exportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      const result = await reportsApi.export(filters);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xuất Excel.');
    } finally {
      setExporting(false);
    }
  };
  const resetFilters = () => {
    setCycleId(ALL); setDepartmentId(ALL); setEmployeeId(ALL); setPlanStatus(ALL);
    setEvaluationStatus(ALL); setFinalGrade(ALL); setSearch(''); setSortBy('created_at');
    setSortOrder('desc'); setPage(1);
  };
  const activeFilterCount = [cycleId, departmentId, employeeId, planStatus, evaluationStatus, finalGrade]
    .filter(value => value !== ALL).length + (search ? 1 : 0);
  const optionsWithAll = (values: Array<{ id: string; name: string }>, allLabel: string) => [
    { value: ALL, label: allLabel },
    ...values.map(value => ({ value: value.id, label: value.name })),
  ];

  return <main className="flex flex-col gap-5">
    <PageHeader
      title="Báo cáo BSC"
      description="Dữ liệu được giới hạn theo quyền và phạm vi do backend xác định."
      action={user?.permissions.includes('bsc.report.export') && <Button className="min-h-11 w-full md:min-h-0 md:w-auto" disabled={exporting} aria-busy={exporting} onClick={() => void exportExcel()}>
        {exporting ? <Spinner data-icon="inline-start"/> : <DownloadIcon data-icon="inline-start"/>}{exporting ? 'Đang xuất…' : 'Xuất Excel'}
      </Button>}
    />
    <Card>
      <CardHeader>
        <CardTitle>Bộ lọc báo cáo</CardTitle>
        <CardDescription>Kết hợp nhiều điều kiện để thu hẹp dữ liệu cần phân tích.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect id="report-cycle" label="Kỳ BSC" value={cycleId} onChange={change(setCycleId)} options={optionsWithAll(options?.cycles ?? [], 'Tất cả kỳ')}/>
          <FilterSelect id="report-department" label="Phòng ban" value={departmentId} onChange={change(setDepartmentId)} options={optionsWithAll(options?.departments ?? [], 'Tất cả phòng ban')}/>
          <FilterSelect id="report-employee" label="Nhân viên" value={employeeId} onChange={change(setEmployeeId)} options={[
            { value: ALL, label: 'Tất cả nhân viên' },
            ...(options?.employees ?? []).map(item => ({ value: item.id, label: item.full_name })),
          ]}/>
          <FilterSelect id="report-plan" label="Trạng thái kế hoạch" value={planStatus} onChange={change(setPlanStatus)} options={[
            { value: ALL, label: 'Tất cả' }, ...statuses.map(value => ({ value, label: workflowStatusLabel(value) })),
          ]}/>
          <FilterSelect id="report-evaluation" label="Trạng thái đánh giá" value={evaluationStatus} onChange={change(setEvaluationStatus)} options={[
            { value: ALL, label: 'Tất cả' }, ...['NOT_STARTED', ...statuses].map(value => ({ value, label: workflowStatusLabel(value) })),
          ]}/>
          <FilterSelect id="report-grade" label="Xếp loại" value={finalGrade} onChange={change(setFinalGrade)} options={[
            { value: ALL, label: 'Tất cả' }, ...['C', 'B', 'A', 'A+', 'A++'].map(value => ({ value, label: value })),
          ]}/>
          <FilterSelect id="report-sort" label="Sắp xếp" value={sortBy} onChange={change(setSortBy)} options={[
            { value: 'created_at', label: 'Ngày tạo' }, { value: 'final_score', label: 'Điểm cuối' },
            { value: 'plan_approved_at', label: 'Ngày duyệt kế hoạch' }, { value: 'evaluation_approved_at', label: 'Ngày duyệt đánh giá' },
          ]}/>
          <FilterSelect id="report-order" label="Thứ tự" value={sortOrder} onChange={change(setSortOrder)} options={[
            { value: 'desc', label: 'Giảm dần' }, { value: 'asc', label: 'Tăng dần' },
          ]}/>
          <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
          <Field><FieldLabel className="sr-only">Đặt lại</FieldLabel><Button className="min-h-11 w-full md:min-h-0" variant="outline" onClick={resetFilters} disabled={activeFilterCount === 0 && sortBy === 'created_at' && sortOrder === 'desc'}>
            <RotateCcwIcon data-icon="inline-start"/>Đặt lại bộ lọc
          </Button></Field>
        </FieldGroup>
      </CardContent>
    </Card>
    <div role="status"><Badge variant="secondary">{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang áp dụng` : 'Toàn bộ dữ liệu trong phạm vi'}</Badge></div>
    {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>}
    {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message="Không có dữ liệu BSC phù hợp."/> : !error && <>
      <div className="flex flex-col gap-3 md:hidden">{items.map(row => <Card key={row.id}>
        <CardHeader><CardTitle><Link to={`/employee-bsc/${row.id}`}>{row.employeeName}</Link></CardTitle><CardDescription>{row.departmentName} · {row.positionName}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3"><dl><dt>Kỳ</dt><dd>{row.cycleName}</dd><dt>Quản lý trực tiếp</dt><dd>{row.directManagerName}</dd><dt>Kế hoạch</dt><dd><BscStatusBadge status={row.planStatus}/></dd><dt>Đánh giá</dt><dd><BscStatusBadge status={row.evaluationStatus}/></dd><dt>Tỷ trọng / KPI</dt><dd>{row.totalWeight}% / {row.kpiCount}</dd><dt>Điểm / Xếp loại</dt><dd>{row.officialScore ?? '—'} / {row.officialGrade ?? '—'}</dd><dt>Duyệt kế hoạch</dt><dd>{date(row.planApprovedAt)}</dd><dt>Duyệt đánh giá</dt><dd>{date(row.evaluationApprovedAt)}</dd></dl><Button className="min-h-11 w-full" variant="outline" asChild><Link to={`/employee-bsc/${row.id}`}>Xem chi tiết</Link></Button></CardContent>
      </Card>)}</div>
      <Card className="hidden md:flex">
        <CardHeader><CardTitle>Báo cáo BSC chi tiết</CardTitle><CardDescription>{total} BSC phù hợp với điều kiện hiện tại.</CardDescription></CardHeader>
        <CardContent><Table className="min-w-[1300px]">
          <TableHeader><TableRow><TableHead>Họ tên</TableHead><TableHead>Phòng ban</TableHead><TableHead>Chức danh</TableHead><TableHead>Quản lý trực tiếp</TableHead><TableHead>Kỳ BSC</TableHead><TableHead>Kế hoạch</TableHead><TableHead>Đánh giá</TableHead><TableHead>Tỷ trọng</TableHead><TableHead>Số KPI</TableHead><TableHead>Điểm</TableHead><TableHead>Xếp loại</TableHead><TableHead>Duyệt kế hoạch</TableHead><TableHead>Duyệt đánh giá</TableHead></TableRow></TableHeader>
          <TableBody>{items.map(row => <TableRow key={row.id} className="cursor-pointer focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-ring" onClick={() => navigate(`/employee-bsc/${row.id}`)}>
            <TableCell><Link to={`/employee-bsc/${row.id}`} onClick={event => event.stopPropagation()} aria-label={`Xem BSC của ${row.employeeName} kỳ ${row.cycleName}`}>{row.employeeName}</Link></TableCell>
            <TableCell>{row.departmentName}</TableCell><TableCell>{row.positionName}</TableCell><TableCell>{row.directManagerName}</TableCell><TableCell>{row.cycleName}</TableCell>
            <TableCell><BscStatusBadge status={row.planStatus}/></TableCell><TableCell><BscStatusBadge status={row.evaluationStatus}/></TableCell>
            <TableCell>{row.totalWeight}%</TableCell><TableCell>{row.kpiCount}</TableCell><TableCell>{row.officialScore ?? '—'}</TableCell><TableCell>{row.officialGrade ?? '—'}</TableCell>
            <TableCell>{date(row.planApprovedAt)}</TableCell><TableCell>{date(row.evaluationApprovedAt)}</TableCell>
          </TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </>}
    <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage}/>
  </main>;
};
