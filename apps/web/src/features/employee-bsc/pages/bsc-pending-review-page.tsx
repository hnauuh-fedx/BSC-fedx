import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, RotateCcwIcon } from 'lucide-react';
import { useAuthContext } from '../../../app/store/auth-store';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Textarea } from '../../../components/ui/textarea';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';

type Stage = 'PLAN' | 'EVALUATION';
const LIMIT = 10;
const ALL = 'ALL';
const ALL_REVIEW = [
  BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
  BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
  BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE,
  BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE,
];
const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—';

export const BscPendingReviewPage: React.FC = () => {
  const { state } = useAuthContext();
  const permissions = state.user?.permissions ?? [];
  const [stage, setStage] = useState<Stage>('PLAN');
  const [items, setItems] = useState<EmployeeBsc[]>([]);
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [cycleId, setCycleId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [actingId, setActingId] = useState('');
  const [approving, setApproving] = useState<EmployeeBsc | null>(null);
  const [returning, setReturning] = useState<EmployeeBsc | null>(null);
  const [reason, setReason] = useState('');
  const loadGeneration = useRef(0);

  const approvePermission = stage === 'PLAN'
    ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE
    : BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE;
  const returnPermission = stage === 'PLAN'
    ? BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE
    : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE;
  const allowed = permissions.includes(approvePermission) || permissions.includes(returnPermission);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    setItems([]);
    setTotal(0);
    if (!allowed) {
      setLoading(false);
      return;
    }
    try {
      const sortBy = stage === 'PLAN' ? 'plan_submitted_at' : 'evaluation_submitted_at';
      const result = await employeeBscApi.pendingReview({
        stage,
        search,
        cycleId: cycleId === ALL ? '' : cycleId,
        departmentId: departmentId === ALL ? '' : departmentId,
        page,
        limit: LIMIT,
        sortBy,
        sortOrder: 'asc',
      });
      if (generation !== loadGeneration.current) return;
      setItems(result.items);
      setTotal(result.total);
      setCycles(result.filterOptions?.cycles ?? []);
      setDepartments(result.filterOptions?.departments ?? []);
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      setCycles([]);
      setDepartments([]);
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách chờ duyệt.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [allowed, stage, search, cycleId, departmentId, page]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load, reload]);

  const approve = async (item: EmployeeBsc) => {
    setActingId(item.id);
    setError('');
    try {
      if (stage === 'PLAN') await employeeBscApi.approvePlan(item.id);
      else await employeeBscApi.approveEvaluation(item.id);
      setApproving(null);
      setReload(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể duyệt BSC.');
    } finally {
      setActingId('');
    }
  };

  const returnBsc = async () => {
    if (!returning || !reason.trim()) return;
    setActingId(returning.id);
    setError('');
    try {
      if (stage === 'PLAN') await employeeBscApi.returnPlan(returning.id, reason);
      else await employeeBscApi.returnEvaluation(returning.id, reason);
      setReturning(null);
      setReason('');
      setReload(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể trả lại BSC.');
    } finally {
      setActingId('');
    }
  };

  const switchStage = (next: string) => {
    setStage(next as Stage);
    setPage(1);
    setApproving(null);
    setReturning(null);
    setReason('');
    setError('');
  };

  return <PermissionGate anyOf={ALL_REVIEW}>
    <main>
      <PageHeader
        title="BSC chờ duyệt"
        description="Xử lý độc lập nội dung kế hoạch và kết quả tự đánh giá theo đúng thẩm quyền."
        action={<Button variant="outline" asChild><Link to="/employee-bsc">Danh sách BSC</Link></Button>}
      />
      <Tabs value={stage} onValueChange={switchStage}>
        <TabsList aria-label="Giai đoạn duyệt">
          <TabsTrigger value="PLAN">Chờ duyệt BSC</TabsTrigger>
          <TabsTrigger value="EVALUATION">Chờ duyệt kết quả</TabsTrigger>
        </TabsList>
      </Tabs>
      {!allowed ? <ErrorState error="Bạn không có quyền xử lý giai đoạn này."/> : <>
        <Card>
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
            <CardDescription>Thu hẹp danh sách theo kỳ, đơn vị hoặc nội dung tìm kiếm.</CardDescription>
          </CardHeader>
          <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <Field><FieldLabel className="sr-only">Tìm BSC</FieldLabel><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/></Field>
            <Field>
              <FieldLabel htmlFor="pending-cycle">Kỳ BSC</FieldLabel>
              <Select value={cycleId} onValueChange={value => { setCycleId(value); setPage(1); }}>
                <SelectTrigger id="pending-cycle"><SelectValue/></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value={ALL}>Tất cả kỳ</SelectItem>
                  {cycles.map(cycle => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="pending-department">Đơn vị</FieldLabel>
              <Select value={departmentId} onValueChange={value => { setDepartmentId(value); setPage(1); }}>
                <SelectTrigger id="pending-department"><SelectValue/></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value={ALL}>Tất cả đơn vị</SelectItem>
                  {departments.map(department => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          </CardContent>
        </Card>
        {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>}
        {loading ? <LoadingState/> : !error && items.length === 0
          ? <EmptyState message={stage === 'PLAN' ? 'Không có BSC chờ duyệt nội dung.' : 'Không có BSC chờ duyệt kết quả.'}/>
          : !error && <>
          <div className="flex flex-col gap-3 md:hidden">{items.map(item => <Card key={item.id}>
            <CardHeader><CardTitle><Link to={`/employee-bsc/${item.id}`}>{item.bsc_code}</Link></CardTitle><CardDescription>{item.users_employee_bsc_employee_idTousers.full_name} · {item.bsc_cycles.name}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl><dt>Đơn vị</dt><dd>{item.departments.name}</dd><dt>Ngày nộp</dt><dd>{formatDate(stage === 'PLAN' ? item.plan_submitted_at : item.evaluation_submitted_at)}</dd><dt>Trạng thái</dt><dd><BscStatusBadge status={stage === 'PLAN' ? item.plan_status : item.evaluation_status}/></dd></dl>
              <div className="flex flex-col gap-2">
                <PermissionGate permission={returnPermission}><Button className="min-h-11 w-full" variant="outline" disabled={Boolean(actingId)} onClick={() => { setReturning(item); setReason(''); }}><RotateCcwIcon data-icon="inline-start"/>Trả lại</Button></PermissionGate>
                <PermissionGate permission={approvePermission}><Button className="min-h-11 w-full" disabled={Boolean(actingId)} onClick={() => setApproving(item)}><CheckIcon data-icon="inline-start"/>Duyệt</Button></PermissionGate>
              </div>
            </CardContent>
          </Card>)}</div>
          <Card className="hidden md:flex">
            <CardHeader>
              <CardTitle>Danh sách chờ duyệt</CardTitle>
              <CardDescription>{total} BSC đang chờ xử lý ở giai đoạn này.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mã BSC</TableHead><TableHead>Nhân viên</TableHead><TableHead>Kỳ</TableHead>
                  <TableHead>Đơn vị</TableHead><TableHead>Ngày nộp</TableHead><TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow></TableHeader>
                <TableBody>{items.map(item => <TableRow key={item.id}>
                  <TableCell><Link to={`/employee-bsc/${item.id}`}>{item.bsc_code}</Link></TableCell>
                  <TableCell>{item.users_employee_bsc_employee_idTousers.full_name}</TableCell>
                  <TableCell>{item.bsc_cycles.name}</TableCell>
                  <TableCell>{item.departments.name}</TableCell>
                  <TableCell>{formatDate(stage === 'PLAN' ? item.plan_submitted_at : item.evaluation_submitted_at)}</TableCell>
                  <TableCell><BscStatusBadge status={stage === 'PLAN' ? item.plan_status : item.evaluation_status}/></TableCell>
                  <TableCell><div className="flex flex-wrap justify-end gap-2">
                    <PermissionGate permission={returnPermission}>
                      <Button className="min-h-11 md:min-h-0" variant="outline" size="sm" disabled={Boolean(actingId)} onClick={() => { setReturning(item); setReason(''); }}>
                        <RotateCcwIcon data-icon="inline-start"/>Trả lại
                      </Button>
                    </PermissionGate>
                    <PermissionGate permission={approvePermission}>
                      <Button className="min-h-11 md:min-h-0" variant="outline" size="sm" disabled={Boolean(actingId)} onClick={() => setApproving(item)}>
                        <CheckIcon data-icon="inline-start"/>{actingId === item.id ? 'Đang xử lý…' : 'Duyệt'}
                      </Button>
                    </PermissionGate>
                  </div></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card></>}
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
      </>}
      <AccessibleDialog
        open={Boolean(approving)}
        title={`Duyệt ${stage === 'PLAN' ? 'nội dung' : 'kết quả'} ${approving?.bsc_code ?? ''}`}
        description={stage === 'PLAN' ? 'Sau khi duyệt, định nghĩa KPI sẽ bị khóa và chủ sở hữu có thể nhập kết quả.' : 'Sau khi duyệt, điểm và xếp loại trở thành chính thức; toàn bộ BSC sẽ bị khóa.'}
        onClose={() => setApproving(null)}
        busy={Boolean(actingId)}
      >
        <div className="dialog-actions">
          <Button disabled={Boolean(actingId)} onClick={() => approving && void approve(approving)}>
            {actingId && <Spinner data-icon="inline-start"/>}Xác nhận duyệt
          </Button>
          <Button variant="outline" disabled={Boolean(actingId)} onClick={() => setApproving(null)}>Hủy</Button>
        </div>
      </AccessibleDialog>
      <AccessibleDialog
        open={Boolean(returning)}
        title={`Trả lại ${stage === 'PLAN' ? 'nội dung' : 'kết quả'} ${returning?.bsc_code ?? ''}`}
        description="BSC sẽ được mở đúng nhóm trường của giai đoạn này để chủ sở hữu chỉnh sửa và nộp lại."
        onClose={() => setReturning(null)}
        busy={Boolean(actingId)}
      >
        <FieldGroup><Field data-invalid={!reason.trim()}>
          <FieldLabel htmlFor="return-reason">Lý do trả lại</FieldLabel>
          <Textarea id="return-reason" aria-invalid={!reason.trim()} maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/>
          {!reason.trim() && <FieldDescription>Vui lòng nhập lý do cụ thể.</FieldDescription>}
        </Field></FieldGroup>
        <div className="dialog-actions">
          <Button disabled={!reason.trim() || Boolean(actingId)} onClick={() => void returnBsc()}>
            {actingId && <Spinner data-icon="inline-start"/>}Xác nhận trả lại
          </Button>
          <Button variant="outline" disabled={Boolean(actingId)} onClick={() => setReturning(null)}>Hủy</Button>
        </div>
      </AccessibleDialog>
    </main>
  </PermissionGate>;
};
