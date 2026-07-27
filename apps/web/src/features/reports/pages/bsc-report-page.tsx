import React, { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldTitle } from '../../../components/ui/field';
import { Skeleton } from '../../../components/ui/skeleton';
import { Spinner } from '../../../components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '../../../components/ui/toggle-group';
import { useAuth } from '../../auth/hooks/use-auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../../organization/management-ui';
import { BscReportFilters, FilterSelect, ReportFilterValues } from '../components/bsc-report-filters';
import { BscReportMetrics } from '../components/bsc-report-metrics';
import { BscReportTable } from '../components/bsc-report-table';
import { reportsApi } from '../reports-api';
import { ReportOptions, ReportRow, ReportSummary } from '../reports.types';

const PAGE_SIZE = 20;
const ALL = 'ALL';
type ViewScope = 'PERSONAL' | 'MANAGEMENT';
type ReportTab = 'overview' | 'list';
type ReportViewState = ReportFilterValues & {
  tab: ReportTab;
  cycleId: string;
  page: number;
};
type ReportViewAction =
  | { type: 'set-filter'; key: keyof ReportFilterValues | 'cycleId'; value: string }
  | { type: 'set-tab'; value: ReportTab }
  | { type: 'set-page'; value: number }
  | { type: 'reset-management' }
  | { type: 'reset-filters' };

const initialReportViewState = (urlState: URLSearchParams): ReportViewState => ({
  tab: urlState.get('view') === 'list' ? 'list' : 'overview',
  cycleId: urlState.get('cycleId') ?? ALL,
  departmentId: urlState.get('departmentId') ?? ALL,
  employeeId: urlState.get('employeeId') ?? ALL,
  planStatus: urlState.get('planStatus') ?? ALL,
  evaluationStatus: urlState.get('evaluationStatus') ?? ALL,
  finalGrade: urlState.get('finalGrade') ?? ALL,
  search: urlState.get('search') ?? '',
  sortBy: urlState.get('sortBy') ?? 'created_at',
  sortOrder: urlState.get('sortOrder') ?? 'desc',
  page: Number(urlState.get('page')) || 1,
});

const reportViewReducer = (state: ReportViewState, action: ReportViewAction): ReportViewState => {
  if (action.type === 'set-filter') {
    return { ...state, [action.key]: action.value, page: 1 };
  }
  if (action.type === 'set-tab') return { ...state, tab: action.value };
  if (action.type === 'set-page') return { ...state, page: action.value };
  if (action.type === 'reset-management') {
    return { ...state, departmentId: ALL, employeeId: ALL, search: '', page: 1 };
  }
  return {
    ...state,
    cycleId: ALL,
    departmentId: ALL,
    employeeId: ALL,
    planStatus: ALL,
    evaluationStatus: ALL,
    finalGrade: ALL,
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    page: 1,
  };
};

const optionsWithAll = (values: Array<{ id: string; name: string }>, allLabel: string) => [
  { value: ALL, label: allLabel },
  ...values.map(value => ({ value: value.id, label: value.name })),
];

const LazyBscReportCharts = React.lazy(() => import('../components/bsc-report-charts').then(module => ({
  default: module.BscReportCharts,
})));

const ChartLoadingState: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>Đang dựng biểu đồ</CardTitle>
      <CardDescription>Dữ liệu báo cáo đã sẵn sàng.</CardDescription>
    </CardHeader>
    <CardContent><Skeleton className="h-[300px] w-full"/></CardContent>
  </Card>
);

const ReportScopeCard: React.FC<{
  options: ReportOptions | null;
  scope: ViewScope | null;
  isManagement: boolean;
  userName: string;
  cycleId: string;
  onScopeChange: (value: string) => void;
  onCycleChange: (value: string) => void;
}> = ({
  options,
  scope,
  isManagement,
  userName,
  cycleId,
  onScopeChange,
  onCycleChange,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Phạm vi và kỳ báo cáo</CardTitle>
      <CardDescription>Phạm vi được backend giới hạn theo permission và assignment đang có hiệu lực.</CardDescription>
    </CardHeader>
    <CardContent>
      <FieldGroup className="grid grid-cols-4 items-end gap-4">
        {options?.capabilities.canViewPersonal && options.capabilities.canViewManagement && scope && (
          <Field className="col-span-2">
            <FieldTitle id="report-scope-label">Phạm vi báo cáo</FieldTitle>
            <ToggleGroup
              type="single"
              value={scope}
              onValueChange={value => { if (value) onScopeChange(value); }}
              variant="outline"
              spacing={0}
              aria-labelledby="report-scope-label"
            >
              <ToggleGroupItem value="MANAGEMENT">Đơn vị phụ trách</ToggleGroupItem>
              <ToggleGroupItem value="PERSONAL">Cá nhân</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        )}
        <FilterSelect
          id="report-cycle"
          label="Kỳ BSC"
          value={cycleId}
          onChange={onCycleChange}
          options={optionsWithAll(options?.cycles ?? [], 'Tất cả kỳ')}
        />
        <Field>
          <FieldLabel>Phạm vi dữ liệu hiện tại</FieldLabel>
          <div className="flex h-9 items-center">
            <Badge variant="outline">{isManagement ? 'Đơn vị được phân công' : userName}</Badge>
          </div>
        </Field>
      </FieldGroup>
    </CardContent>
  </Card>
);

export const BscReportPage: React.FC = () => {
  const { user } = useAuth();
  const [urlState, setUrlState] = useSearchParams();
  const requestId = useRef(0);
  const scopeOptionsRequestId = useRef(0);
  const [requestedScope] = useState(() => urlState.get('viewScope'));
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [scope, setScope] = useState<ViewScope | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [items, setItems] = useState<ReportRow[]>([]);
  const [viewState, dispatchView] = useReducer(reportViewReducer, urlState, initialReportViewState);
  const {
    tab,
    cycleId,
    departmentId,
    employeeId,
    planStatus,
    evaluationStatus,
    finalGrade,
    search,
    sortBy,
    sortOrder,
    page,
  } = viewState;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [optionsReload, setOptionsReload] = useState(0);
  const [scopeOptionsReload, setScopeOptionsReload] = useState(0);
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
        const requested = requestedScope;
        const requestedAllowed = requested === 'PERSONAL'
          ? result.capabilities.canViewPersonal
          : requested === 'MANAGEMENT' && result.capabilities.canViewManagement;
        setScope(requestedAllowed ? requested as ViewScope : result.capabilities.defaultScope);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải cấu hình báo cáo.'))
      .finally(() => setLoadingOptions(false));
  }, [optionsReload, requestedScope]);

  useEffect(() => {
    if (!scope) return;
    const currentRequest = ++scopeOptionsRequestId.current;
    setError('');
    reportsApi.options({ viewScope: scope })
      .then(result => {
        if (currentRequest === scopeOptionsRequestId.current) setOptions(result);
      })
      .catch(cause => {
        if (currentRequest === scopeOptionsRequestId.current) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải bộ lọc theo phạm vi báo cáo.');
        }
      });
  }, [scope, scopeOptionsReload]);

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

  const changeScope = (value: string) => {
    setScope(value as ViewScope);
    dispatchView({ type: 'reset-management' });
  };

  const resetFilters = () => dispatchView({ type: 'reset-filters' });

  const updateListFilter = (key: keyof ReportFilterValues, value: string) => {
    dispatchView({ type: 'set-filter', key, value });
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

  const isManagement = scope === 'MANAGEMENT';
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
          onRetry={() => {
            if (!options) {
              setOptionsReload(value => value + 1);
              return;
            }
            setScopeOptionsReload(value => value + 1);
            setReload(value => value + 1);
          }}
        />
      )}

      <ReportScopeCard
        options={options}
        scope={scope}
        isManagement={isManagement}
        userName={user?.fullName ?? 'Cá nhân'}
        cycleId={cycleId}
        onScopeChange={changeScope}
        onCycleChange={value => dispatchView({ type: 'set-filter', key: 'cycleId', value })}
      />

      <Tabs value={tab} onValueChange={value => dispatchView({ type: 'set-tab', value: value as ReportTab })}>
        <TabsList variant="line" aria-label="Chế độ xem báo cáo">
          <TabsTrigger value="overview"><BarChart3Icon data-icon="inline-start"/>Tổng quan</TabsTrigger>
          <TabsTrigger value="list"><FileSpreadsheetIcon data-icon="inline-start"/>Danh sách BSC</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6 pt-3">
          {loading && !summary ? <LoadingState/> : summary && (
            <>
              <BscReportMetrics summary={summary} isManagement={isManagement}/>
              <Suspense fallback={<ChartLoadingState/>}>
                <LazyBscReportCharts summary={summary} isManagement={isManagement}/>
              </Suspense>
            </>
          )}
        </TabsContent>

        <TabsContent value="list" className="flex flex-col gap-5 pt-3">
          <BscReportFilters
            options={options}
            isManagement={isManagement}
            values={{ departmentId, employeeId, search, planStatus, evaluationStatus, finalGrade, sortBy, sortOrder }}
            activeFilterCount={activeFilterCount}
            onChange={updateListFilter}
            onReset={resetFilters}
          />

          <div className="flex items-center justify-between gap-4" role="status">
            <Badge variant="secondary">
              {activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang áp dụng` : 'Toàn bộ dữ liệu trong phạm vi'}
            </Badge>
            <p className="text-sm text-muted-foreground">{summary?.totalBsc ?? 0} BSC phù hợp</p>
          </div>

          {loading ? <LoadingState/> : items.length === 0 ? (
            <EmptyState message="Không có dữ liệu BSC phù hợp."/>
          ) : (
            <BscReportTable items={items} isManagement={isManagement}/>
          )}
          <Pagination
            page={page}
            total={summary?.totalBsc ?? 0}
            limit={PAGE_SIZE}
            onChange={value => dispatchView({ type: 'set-page', value })}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
};
