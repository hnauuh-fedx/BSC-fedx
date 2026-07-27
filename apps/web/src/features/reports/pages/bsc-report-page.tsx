import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3Icon,
  ClipboardCheckIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  TargetIcon,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { useAuth } from '../../auth/hooks/use-auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { reportsApi } from '../reports-api';
import { ReportOptions, ReportRow, ReportSummary } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const PAGE_SIZE = 20;
const ALL = 'ALL';
const STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'];
const EVALUATION_STATUSES = ['NOT_STARTED', ...STATUSES];
const GRADES = ['C', 'B', 'A', 'A+', 'A++'];
type ViewScope = 'PERSONAL' | 'MANAGEMENT';
type ReportTab = 'overview' | 'list';

const formatReportDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(value))
  : '—';

const FilterSelect: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ id, label, value, onChange, options }) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}><SelectValue/></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
);

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
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const StatusSummary: React.FC<{
  title: string;
  description: string;
  values: Record<string, number>;
}> = ({ title, description, values }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      <Table>
        <TableBody>
          {Object.entries(values).map(([status, count]) => (
            <TableRow key={status}>
              <TableCell>{workflowStatusLabel(status)}</TableCell>
              <TableCell className="text-right"><Badge variant="outline">{count}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

const GradeSummary: React.FC<{ values: Record<string, number> }> = ({ values }) => (
  <Card>
    <CardHeader>
      <CardTitle>Phân bố xếp loại</CardTitle>
      <CardDescription>Chỉ sử dụng kết quả EVALUATION đã được duyệt.</CardDescription>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader className="[&_th]:text-center [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
          <TableRow>{GRADES.map(grade => <TableHead key={grade}>{grade}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>{GRADES.map(grade => <TableCell key={grade} className="text-center"><span className="text-lg">{values[grade] ?? 0}</span></TableCell>)}</TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

const DepartmentProgress: React.FC<{ summary: ReportSummary }> = ({ summary }) => (
  <Card>
    <CardHeader>
      <CardTitle>Tiến độ theo phòng ban</CardTitle>
      <CardDescription>Tỷ lệ BSC đã duyệt đánh giá trên tổng số hồ sơ trong phạm vi.</CardDescription>
    </CardHeader>
    <CardContent>
      {summary.departmentProgress.length === 0 ? (
        <EmptyState message="Chưa có dữ liệu tiến độ phòng ban."/>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phòng ban</TableHead>
              <TableHead className="text-right">Đã duyệt</TableHead>
              <TableHead className="text-right">Tổng BSC</TableHead>
              <TableHead className="text-right">Hoàn thành</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.departmentProgress.map(item => (
              <TableRow key={item.departmentId}>
                <TableCell>{item.departmentName}</TableCell>
                <TableCell className="text-right">{item.approvedBsc}</TableCell>
                <TableCell className="text-right">{item.totalBsc}</TableCell>
                <TableCell className="text-right"><Badge variant="outline">{item.completionPercentage}%</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

const ReportStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge variant={status === 'SUBMITTED' ? 'default' : status === 'APPROVED' ? 'outline' : 'secondary'}>
    {workflowStatusLabel(status)}
  </Badge>
);

export const BscReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [urlState, setUrlState] = useSearchParams();
  const requestId = useRef(0);
  const scopeOptionsRequestId = useRef(0);
  const requestedScope = useRef(urlState.get('viewScope'));
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [scope, setScope] = useState<ViewScope | null>(null);
  const [tab, setTab] = useState<ReportTab>(urlState.get('view') === 'list' ? 'list' : 'overview');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [items, setItems] = useState<ReportRow[]>([]);
  const [cycleId, setCycleId] = useState(urlState.get('cycleId') ?? ALL);
  const [departmentId, setDepartmentId] = useState(urlState.get('departmentId') ?? ALL);
  const [employeeId, setEmployeeId] = useState(urlState.get('employeeId') ?? ALL);
  const [planStatus, setPlanStatus] = useState(urlState.get('planStatus') ?? ALL);
  const [evaluationStatus, setEvaluationStatus] = useState(urlState.get('evaluationStatus') ?? ALL);
  const [finalGrade, setFinalGrade] = useState(urlState.get('finalGrade') ?? ALL);
  const [search, setSearch] = useState(urlState.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sortBy, setSortBy] = useState(urlState.get('sortBy') ?? 'created_at');
  const [sortOrder, setSortOrder] = useState(urlState.get('sortOrder') ?? 'desc');
  const [page, setPage] = useState(Number(urlState.get('page')) || 1);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [optionsReload, setOptionsReload] = useState(0);
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setLoadingOptions(true);
    setError('');
    reportsApi.options()
      .then(result => {
        setOptions(result);
        const requested = requestedScope.current;
        const requestedAllowed = requested === 'PERSONAL'
          ? result.capabilities.canViewPersonal
          : requested === 'MANAGEMENT' && result.capabilities.canViewManagement;
        setScope(requestedAllowed ? requested as ViewScope : result.capabilities.defaultScope);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải cấu hình báo cáo.'))
      .finally(() => setLoadingOptions(false));
  }, [optionsReload]);

  useEffect(() => {
    if (!scope) return;
    const currentRequest = ++scopeOptionsRequestId.current;
    reportsApi.options({ viewScope: scope })
      .then(result => {
        if (currentRequest === scopeOptionsRequestId.current) setOptions(result);
      })
      .catch(cause => {
        if (currentRequest === scopeOptionsRequestId.current) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải bộ lọc theo phạm vi báo cáo.');
        }
      });
  }, [scope]);

  const filters = useMemo(() => ({
    viewScope: scope ?? undefined,
    cycleId: cycleId === ALL ? '' : cycleId,
    departmentId: scope === 'MANAGEMENT' && departmentId !== ALL ? departmentId : '',
    employeeId: scope === 'MANAGEMENT' && employeeId !== ALL ? employeeId : '',
    planStatus: planStatus === ALL ? '' : planStatus,
    evaluationStatus: evaluationStatus === ALL ? '' : evaluationStatus,
    finalGrade: finalGrade === ALL ? '' : finalGrade,
    search: scope === 'MANAGEMENT' ? debouncedSearch : '',
  }), [scope, cycleId, departmentId, employeeId, planStatus, evaluationStatus, finalGrade, debouncedSearch]);

  useEffect(() => {
    if (!scope) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    setSummary(null);
    setItems([]);
    Promise.all([
      reportsApi.summary(filters),
      reportsApi.list({ ...filters, sortBy, sortOrder, page, limit: PAGE_SIZE }),
    ])
      .then(([nextSummary, nextPage]) => {
        if (currentRequest !== requestId.current) return;
        setSummary(nextSummary);
        setItems(nextPage.items);
      })
      .catch(cause => {
        if (currentRequest === requestId.current) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo BSC.');
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [filters, sortBy, sortOrder, page, reload, scope]);

  useEffect(() => {
    if (!scope) return;
    const next = new URLSearchParams();
    next.set('view', tab);
    next.set('viewScope', scope);
    if (cycleId !== ALL) next.set('cycleId', cycleId);
    if (scope === 'MANAGEMENT' && departmentId !== ALL) next.set('departmentId', departmentId);
    if (scope === 'MANAGEMENT' && employeeId !== ALL) next.set('employeeId', employeeId);
    if (planStatus !== ALL) next.set('planStatus', planStatus);
    if (evaluationStatus !== ALL) next.set('evaluationStatus', evaluationStatus);
    if (finalGrade !== ALL) next.set('finalGrade', finalGrade);
    if (scope === 'MANAGEMENT' && search) next.set('search', search);
    if (sortBy !== 'created_at') next.set('sortBy', sortBy);
    if (sortOrder !== 'desc') next.set('sortOrder', sortOrder);
    if (page > 1) next.set('page', String(page));
    setUrlState(next, { replace: true });
  }, [scope, tab, cycleId, departmentId, employeeId, planStatus, evaluationStatus, finalGrade, search, sortBy, sortOrder, page, setUrlState]);

  const setFilterAndResetPage = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const changeScope = (value: string) => {
    setScope(value as ViewScope);
    setDepartmentId(ALL);
    setEmployeeId(ALL);
    setSearch('');
    setPage(1);
  };

  const resetFilters = () => {
    setCycleId(ALL);
    setDepartmentId(ALL);
    setEmployeeId(ALL);
    setPlanStatus(ALL);
    setEvaluationStatus(ALL);
    setFinalGrade(ALL);
    setSearch('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const exportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      const result = await reportsApi.export({ ...filters, sortBy, sortOrder });
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

  const activeFilterCount = [
    cycleId,
    scope === 'MANAGEMENT' ? departmentId : ALL,
    scope === 'MANAGEMENT' ? employeeId : ALL,
    planStatus,
    evaluationStatus,
    finalGrade,
  ].filter(value => value !== ALL).length + (scope === 'MANAGEMENT' && search ? 1 : 0);

  const optionsWithAll = (values: Array<{ id: string; name: string }>, allLabel: string) => [
    { value: ALL, label: allLabel },
    ...values.map(value => ({ value: value.id, label: value.name })),
  ];
  const isManagement = scope === 'MANAGEMENT';
  const approvedCount = summary?.evaluationStatusCounts.APPROVED ?? 0;
  const pendingCount = (summary?.pendingPlanReviews ?? 0) + (summary?.pendingEvaluationReviews ?? 0);
  const title = scope === 'PERSONAL' ? 'Báo cáo BSC cá nhân' : 'Báo cáo BSC đơn vị';
  const description = scope === 'PERSONAL'
    ? 'Theo dõi tiến độ, kết quả và xếp loại BSC của bạn qua các kỳ.'
    : 'Tổng hợp tiến độ và kết quả BSC trong phạm vi đơn vị được giao.';

  if (loadingOptions) return <main><LoadingState message="Đang chuẩn bị báo cáo…"/></main>;
  if (!options && error) {
    return <main><ErrorState error={error} onRetry={() => setOptionsReload(value => value + 1)}/></main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        action={scope && (scope === 'PERSONAL'
          ? options?.capabilities.canExportPersonal
          : options?.capabilities.canExportManagement) && (
          <Button disabled={exporting || !scope} aria-busy={exporting} onClick={() => void exportExcel()}>
            {exporting ? <Spinner data-icon="inline-start"/> : <DownloadIcon data-icon="inline-start"/>}
            {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </Button>
        )}
      />

      {error && (
        <ErrorState
          error={error}
          onRetry={() => options ? setReload(value => value + 1) : setOptionsReload(value => value + 1)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Phạm vi và kỳ báo cáo</CardTitle>
          <CardDescription>Phạm vi được backend giới hạn theo permission và assignment đang có hiệu lực.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid grid-cols-4 items-end gap-4">
            {options?.capabilities.canViewPersonal && options.capabilities.canViewManagement && scope && (
              <FilterSelect
                id="report-scope"
                label="Phạm vi báo cáo"
                value={scope}
                onChange={changeScope}
                options={[
                  { value: 'MANAGEMENT', label: 'Đơn vị phụ trách' },
                  { value: 'PERSONAL', label: 'Cá nhân' },
                ]}
              />
            )}
            <FilterSelect
              id="report-cycle"
              label="Kỳ BSC"
              value={cycleId}
              onChange={setFilterAndResetPage(setCycleId)}
              options={optionsWithAll(options?.cycles ?? [], 'Tất cả kỳ')}
            />
            <Field>
              <FieldLabel>Phạm vi dữ liệu hiện tại</FieldLabel>
              <div className="flex h-9 items-center">
                <Badge variant="outline">{isManagement ? 'Đơn vị được phân công' : user?.fullName ?? 'Cá nhân'}</Badge>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={value => setTab(value as ReportTab)}>
        <TabsList variant="line" aria-label="Chế độ xem báo cáo">
          <TabsTrigger value="overview"><BarChart3Icon data-icon="inline-start"/>Tổng quan</TabsTrigger>
          <TabsTrigger value="list"><FileSpreadsheetIcon data-icon="inline-start"/>Danh sách BSC</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6 pt-3">
          {loading && !summary ? <LoadingState/> : summary && (
            <>
              <section className="grid grid-cols-4 gap-4" aria-label="Chỉ số tổng quan">
                <MetricCard label="Tổng số BSC" value={summary.totalBsc} description="Hồ sơ phù hợp với bộ lọc hiện tại." icon={FileSpreadsheetIcon}/>
                <MetricCard label="Đã duyệt đánh giá" value={approvedCount} description="Có điểm và xếp loại chính thức." icon={ClipboardCheckIcon}/>
                <MetricCard label="Điểm trung bình" value={summary.approvedAverageScore ?? '—'} description="Chỉ tính BSC đã duyệt EVALUATION." icon={TargetIcon}/>
                <MetricCard
                  label={isManagement ? 'Đang chờ bạn xử lý' : 'BSC cần hoàn thiện'}
                  value={isManagement ? pendingCount : (summary.planStatusCounts.DRAFT ?? 0) + (summary.evaluationStatusCounts.DRAFT ?? 0)}
                  description={isManagement ? 'PLAN và EVALUATION đang chờ duyệt.' : 'Hồ sơ đang ở trạng thái nháp.'}
                  icon={ClipboardCheckIcon}
                />
              </section>

              <section className="grid grid-cols-2 gap-6" aria-label="Trạng thái workflow">
                <StatusSummary title="Trạng thái kế hoạch" description="Phân bố hồ sơ theo stage PLAN." values={summary.planStatusCounts}/>
                <StatusSummary title="Trạng thái đánh giá" description="Phân bố hồ sơ theo stage EVALUATION." values={summary.evaluationStatusCounts}/>
              </section>

              <GradeSummary values={summary.gradeDistribution}/>
              {isManagement && <DepartmentProgress summary={summary}/>}
            </>
          )}
        </TabsContent>

        <TabsContent value="list" className="flex flex-col gap-5 pt-3">
          <Card>
            <CardHeader>
              <CardTitle>Bộ lọc danh sách</CardTitle>
              <CardDescription>Kết hợp điều kiện để thu hẹp dữ liệu trước khi xem hoặc xuất báo cáo.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-4 items-end gap-4">
                {isManagement && (
                  <>
                    <FilterSelect id="report-department" label="Phòng ban" value={departmentId} onChange={setFilterAndResetPage(setDepartmentId)} options={optionsWithAll(options?.departments ?? [], 'Tất cả phòng ban')}/>
                    <FilterSelect id="report-employee" label="Nhân viên" value={employeeId} onChange={setFilterAndResetPage(setEmployeeId)} options={[
                      { value: ALL, label: 'Tất cả nhân viên' },
                      ...(options?.employees ?? []).map(item => ({ value: item.id, label: item.full_name })),
                    ]}/>
                    <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} label="Tìm nhân viên"/>
                  </>
                )}
                <FilterSelect id="report-plan" label="Trạng thái kế hoạch" value={planStatus} onChange={setFilterAndResetPage(setPlanStatus)} options={[
                  { value: ALL, label: 'Tất cả' },
                  ...STATUSES.map(value => ({ value, label: workflowStatusLabel(value) })),
                ]}/>
                <FilterSelect id="report-evaluation" label="Trạng thái đánh giá" value={evaluationStatus} onChange={setFilterAndResetPage(setEvaluationStatus)} options={[
                  { value: ALL, label: 'Tất cả' },
                  ...EVALUATION_STATUSES.map(value => ({ value, label: workflowStatusLabel(value) })),
                ]}/>
                <FilterSelect id="report-grade" label="Xếp loại" value={finalGrade} onChange={setFilterAndResetPage(setFinalGrade)} options={[
                  { value: ALL, label: 'Tất cả' },
                  ...GRADES.map(value => ({ value, label: value })),
                ]}/>
                <FilterSelect id="report-sort" label="Sắp xếp" value={sortBy} onChange={setFilterAndResetPage(setSortBy)} options={[
                  { value: 'created_at', label: 'Ngày tạo' },
                  { value: 'final_score', label: 'Điểm cuối' },
                  { value: 'plan_approved_at', label: 'Ngày duyệt kế hoạch' },
                  { value: 'evaluation_approved_at', label: 'Ngày duyệt đánh giá' },
                ]}/>
                <FilterSelect id="report-order" label="Thứ tự" value={sortOrder} onChange={setFilterAndResetPage(setSortOrder)} options={[
                  { value: 'desc', label: 'Giảm dần' },
                  { value: 'asc', label: 'Tăng dần' },
                ]}/>
                <Field>
                  <FieldLabel className="sr-only">Đặt lại</FieldLabel>
                  <Button variant="outline" onClick={resetFilters} disabled={activeFilterCount === 0 && sortBy === 'created_at' && sortOrder === 'desc'}>
                    <RotateCcwIcon data-icon="inline-start"/>Đặt lại bộ lọc
                  </Button>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4" role="status">
            <Badge variant="secondary">
              {activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang áp dụng` : 'Toàn bộ dữ liệu trong phạm vi'}
            </Badge>
            <p className="text-sm text-muted-foreground">{summary?.totalBsc ?? 0} BSC phù hợp</p>
          </div>

          {loading ? <LoadingState/> : items.length === 0 ? (
            <EmptyState message="Không có dữ liệu BSC phù hợp."/>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Báo cáo BSC chi tiết</CardTitle>
                <CardDescription>Chọn tên nhân sự để mở hồ sơ BSC tương ứng.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table className={isManagement ? 'min-w-[1120px]' : 'min-w-[820px]'}>
                  <TableHeader className="[&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
                    <TableRow>
                      {isManagement && <><TableHead>Họ tên</TableHead><TableHead>Phòng ban</TableHead><TableHead>Chức danh</TableHead></>}
                      <TableHead>Kỳ BSC</TableHead>
                      <TableHead>Kế hoạch</TableHead>
                      <TableHead>Đánh giá</TableHead>
                      <TableHead className="text-right">Tỷ trọng / KPI</TableHead>
                      <TableHead className="text-right">Điểm</TableHead>
                      <TableHead className="text-center">Xếp loại</TableHead>
                      <TableHead>Duyệt kế hoạch</TableHead>
                      <TableHead>Duyệt đánh giá</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(row => (
                      <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/employee-bsc/${row.id}`)}>
                        {isManagement && (
                          <>
                            <TableCell>
                              <Link
                                className="font-medium"
                                to={`/employee-bsc/${row.id}`}
                                onClick={event => event.stopPropagation()}
                                aria-label={`Xem BSC của ${row.employeeName} kỳ ${row.cycleName}`}
                              >
                                {row.employeeName}
                              </Link>
                            </TableCell>
                            <TableCell>{row.departmentName}</TableCell>
                            <TableCell>{row.positionName}</TableCell>
                          </>
                        )}
                        {!isManagement && (
                          <TableCell>
                            <Link
                              className="font-medium"
                              to={`/employee-bsc/${row.id}`}
                              onClick={event => event.stopPropagation()}
                              aria-label={`Xem BSC của ${row.employeeName} kỳ ${row.cycleName}`}
                            >
                              {row.cycleName}
                            </Link>
                          </TableCell>
                        )}
                        {isManagement && <TableCell>{row.cycleName}</TableCell>}
                        <TableCell><ReportStatusBadge status={row.planStatus}/></TableCell>
                        <TableCell><ReportStatusBadge status={row.evaluationStatus}/></TableCell>
                        <TableCell className="text-right">{row.totalWeight}% / {row.kpiCount}</TableCell>
                        <TableCell className="text-right"><span className="font-medium">{row.officialScore ?? '—'}</span></TableCell>
                        <TableCell className="text-center">{row.officialGrade ? <Badge variant="outline">{row.officialGrade}</Badge> : '—'}</TableCell>
                        <TableCell>{formatReportDate(row.planApprovedAt)}</TableCell>
                        <TableCell>{formatReportDate(row.evaluationApprovedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Pagination page={page} total={summary?.totalBsc ?? 0} limit={PAGE_SIZE} onChange={setPage}/>
        </TabsContent>
      </Tabs>
    </main>
  );
};
