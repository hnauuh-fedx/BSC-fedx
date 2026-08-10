import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigationType, useSearchParams } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { BscStatusBadge } from '../../employee-bsc/components/bsc-status-badge';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../../organization/management-ui';
import {
  ManagementOverviewFilters,
  type ManagementOverviewFilterValues,
  OVERVIEW_ALL,
} from '../components/management-overview-filters';
import { reportsApi } from '../reports-api';
import type { ManagementDashboard, ReportOptions, ReportPage } from '../reports.types';

const MANAGEMENT_PERMISSIONS = ['bsc.statistics.unit', 'bsc.statistics.organization'];
const LIMIT = 20;

type OverviewState = ManagementOverviewFilterValues & { page: number };

const initialState = (params: URLSearchParams): OverviewState => ({
  cycleId: params.get('cycleId') ?? '',
  departmentId: params.get('departmentId') ?? OVERVIEW_ALL,
  employeeId: params.get('employeeId') ?? OVERVIEW_ALL,
  search: params.get('search') ?? '',
  planStatus: params.get('planStatus') ?? OVERVIEW_ALL,
  evaluationStatus: params.get('evaluationStatus') ?? OVERVIEW_ALL,
  finalGrade: params.get('finalGrade') ?? OVERVIEW_ALL,
  page: Math.max(1, Number(params.get('page')) || 1),
});

const Metric: React.FC<{ label: string; value: number; description?: string }> = ({ label, value, description }) => (
  <Card size="sm">
    <CardHeader>
      <CardDescription title={description}>{label}</CardDescription>
      <CardTitle>{value}</CardTitle>
    </CardHeader>
  </Card>
);

const apiFilters = (state: OverviewState, search: string) => ({
  viewScope: 'MANAGEMENT',
  cycleId: state.cycleId || undefined,
  departmentId: state.departmentId === OVERVIEW_ALL ? undefined : state.departmentId,
  employeeId: state.employeeId === OVERVIEW_ALL ? undefined : state.employeeId,
  planStatus: state.planStatus === OVERVIEW_ALL ? undefined : state.planStatus,
  evaluationStatus: state.evaluationStatus === OVERVIEW_ALL ? undefined : state.evaluationStatus,
  finalGrade: state.finalGrade === OVERVIEW_ALL ? undefined : state.finalGrade,
  search: search.trim() || undefined,
});

export const ManagementBscOverviewPage: React.FC = () => {
  const [urlState, setUrlState] = useSearchParams();
  const navigationType = useNavigationType();
  const requestId = useRef(0);
  const urlSyncReady = useRef(false);
  const skipNextUrlWrite = useRef(false);
  const [state, setState] = useState<OverviewState>(() => initialState(urlState));
  const [debouncedSearch, setDebouncedSearch] = useState(state.search);
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [defaultCycleId, setDefaultCycleId] = useState('');
  const [dashboard, setDashboard] = useState<ManagementDashboard | null>(null);
  const [page, setPage] = useState<ReportPage | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      reportsApi.options({ viewScope: 'MANAGEMENT' }),
      reportsApi.dashboard({ viewScope: 'MANAGEMENT' }),
    ])
      .then(([nextOptions, initialDashboard]) => {
        if (!active) return;
        if (initialDashboard.kind !== 'MANAGEMENT') throw new Error('Tài khoản không có tổng quan đơn vị.');
        const nextDefaultCycleId = initialDashboard.currentCycle?.id
          ?? nextOptions.cycles.find(item => item.status === 'OPEN')?.id
          ?? nextOptions.cycles[0]?.id
          ?? '';
        setDefaultCycleId(nextDefaultCycleId);
        setOptions(nextOptions);
        setState(current => ({
          ...current,
          cycleId: nextOptions.cycles.some(item => item.id === current.cycleId)
            ? current.cycleId
            : nextDefaultCycleId,
        }));
        setInitialized(true);
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải cấu hình tổng quan BSC.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(state.search), 300);
    return () => window.clearTimeout(timeout);
  }, [state.search]);

  useEffect(() => {
    if (!initialized) return;
    const currentRequest = ++requestId.current;
    const filters = apiFilters(state, debouncedSearch);
    setLoading(true);
    setError('');
    Promise.all([
      reportsApi.dashboard(filters),
      reportsApi.list({ ...filters, page: state.page, limit: LIMIT, sortBy: 'created_at', sortOrder: 'desc' }),
    ])
      .then(([nextDashboard, nextPage]) => {
        if (currentRequest !== requestId.current) return;
        if (nextDashboard.kind !== 'MANAGEMENT') throw new Error('Tài khoản không có tổng quan đơn vị.');
        setDashboard(nextDashboard);
        setPage(nextPage);
      })
      .catch(cause => {
        if (currentRequest === requestId.current) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải tổng quan BSC.');
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [debouncedSearch, initialized, state.cycleId, state.departmentId, state.employeeId, state.planStatus, state.evaluationStatus, state.finalGrade, state.page]);

  useEffect(() => {
    if (!initialized) return;
    if (!urlSyncReady.current) {
      urlSyncReady.current = true;
      return;
    }
    if (navigationType !== 'POP') return;
    const next = initialState(urlState);
    if (!options?.cycles.some(item => item.id === next.cycleId)) next.cycleId = defaultCycleId;
    setState(current => {
      if (JSON.stringify(current) === JSON.stringify(next)) return current;
      skipNextUrlWrite.current = true;
      return next;
    });
  }, [defaultCycleId, initialized, navigationType, options, urlState]);

  useEffect(() => {
    if (!initialized) return;
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    const next = new URLSearchParams();
    if (state.cycleId) next.set('cycleId', state.cycleId);
    if (state.departmentId !== OVERVIEW_ALL) next.set('departmentId', state.departmentId);
    if (state.employeeId !== OVERVIEW_ALL) next.set('employeeId', state.employeeId);
    if (state.search) next.set('search', state.search);
    if (state.planStatus !== OVERVIEW_ALL) next.set('planStatus', state.planStatus);
    if (state.evaluationStatus !== OVERVIEW_ALL) next.set('evaluationStatus', state.evaluationStatus);
    if (state.finalGrade !== OVERVIEW_ALL) next.set('finalGrade', state.finalGrade);
    if (state.page > 1) next.set('page', String(state.page));
    setUrlState(next, { replace: true });
  }, [initialized, setUrlState, state]);

  const employees = useMemo(() => {
    if (!options || state.departmentId === OVERVIEW_ALL) return options?.employees ?? [];
    return options.employees.filter(item => item.department_id === state.departmentId);
  }, [options, state.departmentId]);

  const updateFilter = (key: keyof ManagementOverviewFilterValues, value: string) => {
    setState(current => {
      const next = { ...current, [key]: value, page: 1 };
      if (key === 'departmentId' && current.employeeId !== OVERVIEW_ALL) {
        const selectedEmployee = options?.employees.find(item => item.id === current.employeeId);
        if (value !== OVERVIEW_ALL && selectedEmployee?.department_id !== value) {
          next.employeeId = OVERVIEW_ALL;
        }
      }
      return next;
    });
  };

  const resetFilters = () => setState(current => ({
    ...current,
    cycleId: defaultCycleId,
    departmentId: OVERVIEW_ALL,
    employeeId: OVERVIEW_ALL,
    search: '',
    planStatus: OVERVIEW_ALL,
    evaluationStatus: OVERVIEW_ALL,
    finalGrade: OVERVIEW_ALL,
    page: 1,
  }));

  const activeFilterCount = [
    state.departmentId,
    state.employeeId,
    state.planStatus,
    state.evaluationStatus,
    state.finalGrade,
  ].filter(value => value !== OVERVIEW_ALL).length
    + (state.search ? 1 : 0)
    + (state.cycleId && state.cycleId !== defaultCycleId ? 1 : 0);

  return (
    <PermissionGate anyOf={MANAGEMENT_PERMISSIONS} fallback={<main><ErrorState error="Bạn không có quyền xem tổng quan BSC theo đơn vị."/></main>}>
      <main className="flex flex-col gap-5">
        <PageHeader
          title="Tổng quan BSC đơn vị"
          description="Dữ liệu nhân sự và BSC được backend giới hạn theo quyền và phạm vi của tài khoản."
          action={<Button className="min-h-11 w-full md:min-h-0 md:w-auto" asChild><Link to="/management/bsc-reviews">Mở BSC chờ duyệt<ArrowRightIcon data-icon="inline-end"/></Link></Button>}
        />

        {options && (
          <ManagementOverviewFilters
            options={options}
            values={state}
            employees={employees}
            activeFilterCount={activeFilterCount}
            onChange={updateFilter}
            onReset={resetFilters}
          />
        )}

        {loading ? <LoadingState/> : error ? <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/> : dashboard && page ? <>
          <Card>
            <CardHeader>
              <CardTitle>Kỳ BSC đang xem</CardTitle>
              <CardDescription>Phạm vi thống kê đang áp dụng cho toàn bộ trang tổng quan.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{dashboard.currentCycle?.name ?? 'Chưa có kỳ BSC'}</Badge>
              <Badge variant="outline">
                {activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang áp dụng` : 'Toàn bộ dữ liệu trong kỳ'}
              </Badge>
            </CardContent>
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số tổng quan">
            <Metric
              label="Chưa tạo BSC"
              value={dashboard.notCreated}
              description="Chỉ số này áp dụng bộ lọc kỳ, phòng ban và nhân viên; không áp dụng trạng thái hoặc xếp loại."
            />
            <Metric label="Chờ duyệt kế hoạch" value={dashboard.pendingPlanReviews}/>
            <Metric label="Kế hoạch bị trả lại" value={dashboard.planStatusCounts.RETURNED ?? 0}/>
            <Metric label="Kế hoạch đã duyệt" value={dashboard.planStatusCounts.APPROVED ?? 0}/>
            <Metric label="Chờ duyệt đánh giá" value={dashboard.pendingEvaluationReviews}/>
            <Metric label="Đánh giá bị trả lại" value={dashboard.evaluationStatusCounts.RETURNED ?? 0}/>
            <Metric label="Đánh giá đã duyệt" value={dashboard.evaluationStatusCounts.APPROVED ?? 0}/>
          </section>

          {page.items.length === 0 ? <EmptyState message="Không có BSC phù hợp với bộ lọc hiện tại."/> : <>
            <div className="flex flex-col gap-3 md:hidden">{page.items.map(item => <Card key={item.id}>
              <CardHeader><CardTitle>{item.employeeName}</CardTitle><CardDescription>{item.employeeCode} · {item.departmentName}</CardDescription></CardHeader>
              <CardContent><dl><dt>Kỳ</dt><dd>{item.cycleName}</dd><dt>Kế hoạch</dt><dd><BscStatusBadge status={item.planStatus}/></dd><dt>Đánh giá</dt><dd><BscStatusBadge status={item.evaluationStatus}/></dd></dl></CardContent>
              <CardFooter><Button className="min-h-11 w-full" variant="outline" asChild><Link to={`/employee-bsc/${item.id}`}>Xem chi tiết</Link></Button></CardFooter>
            </Card>)}</div>
            <Card className="hidden md:flex">
              <CardHeader><CardTitle>BSC trong phạm vi quản lý</CardTitle><CardDescription>{page.total} BSC phù hợp.</CardDescription></CardHeader>
              <CardContent><Table>
                <TableHeader><TableRow><TableHead>Nhân viên</TableHead><TableHead>Mã nhân viên</TableHead><TableHead>Đơn vị</TableHead><TableHead>Kỳ</TableHead><TableHead>Kế hoạch</TableHead><TableHead>Đánh giá</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
                <TableBody>{page.items.map(item => <TableRow key={item.id}>
                  <TableCell>{item.employeeName}</TableCell><TableCell>{item.employeeCode}</TableCell><TableCell>{item.departmentName}</TableCell><TableCell>{item.cycleName}</TableCell>
                  <TableCell><BscStatusBadge status={item.planStatus}/></TableCell><TableCell><BscStatusBadge status={item.evaluationStatus}/></TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" asChild><Link to={`/employee-bsc/${item.id}`}>Xem chi tiết</Link></Button></TableCell>
                </TableRow>)}</TableBody>
              </Table></CardContent>
            </Card>
          </>}
          <Pagination page={state.page} total={page.total} limit={LIMIT} onChange={value => setState(current => ({ ...current, page: value }))}/>
        </> : !error && <EmptyState/>}
      </main>
    </PermissionGate>
  );
};
