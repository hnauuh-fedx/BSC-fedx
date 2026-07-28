import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, CopyIcon, EyeIcon, FilePlus2Icon, FileSpreadsheetIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Textarea } from '../../../components/ui/textarea';
import { useSystemConfirm } from '../../../components/system-confirm-dialog';
import { bscStageLabel } from '../../../lib/bsc-stage';
import { bscCyclesApi, BscCycle } from '../../bsc-cycles';
import { useAuth } from '../../auth/hooks/use-auth';
import { AccessibleDialog, EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../../organization/management-ui';
import { DEPARTMENT_BSC_PERMISSIONS as P, departmentBscApi } from '../department-bsc.service';
import type { DepartmentBsc, DepartmentBscItem, DepartmentBscReopenRequest, DepartmentBscScoring, DepartmentBscVersion } from '../department-bsc.types';

const statusLabel: Record<string, string> = {
  DRAFT: 'Nháp', SUBMITTED: 'Chờ duyệt', RETURNED: 'Trả lại', APPROVED: 'Đã duyệt', REOPENED: 'Được mở lại', NOT_STARTED: 'Chưa bắt đầu',
};
const Status: React.FC<{ value: string }> = ({ value }) => <Badge variant={value === 'APPROVED' ? 'default' : value === 'RETURNED' ? 'destructive' : 'secondary'}>{statusLabel[value] ?? value}</Badge>;
const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString('vi-VN') : '—';
const versionTypeLabel = (value: string) => ({ PLAN_APPROVED: 'Kế hoạch đã duyệt', EVALUATION_APPROVED: 'Đánh giá đã duyệt', PRE_REOPEN: 'Trước khi mở lại' }[value] ?? 'Phiên bản BSC');

const download = ({ blob, fileName }: { blob: Blob; fileName: string }) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const DepartmentBscListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [items, setItems] = useState<DepartmentBsc[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingId, setExportingId] = useState('');
  const [duplicateSource, setDuplicateSource] = useState<DepartmentBsc | null>(null);
  const [duplicateCycles, setDuplicateCycles] = useState<BscCycle[]>([]);
  const [duplicateCycleId, setDuplicateCycleId] = useState('');
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await departmentBscApi.list({ page, limit: 20 }); setItems(result.items); setTotal(result.total); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách BSC phòng ban.'); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const exportExcel = async (item: DepartmentBsc) => {
    setExportingId(item.id); setError('');
    try { download(await departmentBscApi.export(item.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xuất Excel.'); }
    finally { setExportingId(''); }
  };
  const openDuplicate = async (item: DepartmentBsc) => {
    setDuplicateSource(item); setDuplicateLoading(true); setDuplicateError(''); setDuplicateCycles([]); setDuplicateCycleId('');
    try {
      const cycles = (await bscCyclesApi.open()).filter((cycle) => cycle.id !== item.cycle_id);
      setDuplicateCycles(cycles); setDuplicateCycleId(cycles[0]?.id ?? '');
    } catch (cause) { setDuplicateError(cause instanceof Error ? cause.message : 'Không thể tải kỳ đích để sao chép.'); }
    finally { setDuplicateLoading(false); }
  };
  const closeDuplicate = () => {
    if (duplicateBusy) return;
    setDuplicateSource(null); setDuplicateCycles([]); setDuplicateCycleId(''); setDuplicateError('');
  };
  const duplicate = async () => {
    if (!duplicateSource || !duplicateCycleId) return;
    setDuplicateBusy(true); setDuplicateError('');
    try {
      const created = await departmentBscApi.duplicate(duplicateSource.id, duplicateCycleId);
      setDuplicateSource(null); navigate(`/department-bsc/${created.id}`);
    } catch (cause) { setDuplicateError(cause instanceof Error ? cause.message : 'Không thể sao chép BSC phòng ban.'); }
    finally { setDuplicateBusy(false); }
  };
  const canReview = [P.APPROVE_PLAN, P.RETURN_PLAN, P.APPROVE_EVALUATION, P.RETURN_EVALUATION].some((permission) => permissions.includes(permission));
  return <main className="flex flex-col gap-6">
    <PageHeader title="BSC phòng ban" description="Theo dõi kế hoạch và đánh giá của từng phòng ban theo quy trình hai giai đoạn." action={<div className="flex flex-wrap justify-end gap-2">
      {canReview && <Button asChild variant="outline"><Link to="/management/department-bsc-reviews">BSC chờ duyệt</Link></Button>}
      {permissions.includes(P.CREATE) && <Button asChild><Link to="/department-bsc/new"><FilePlus2Icon data-icon="inline-start"/>Tạo BSC phòng ban</Link></Button>}
    </div>}/>
    {error && <ErrorState error={error} onRetry={() => void load()}/>} {loading ? <LoadingState/> : items.length === 0 ? <EmptyState message="Chưa có BSC phòng ban trong phạm vi của bạn."/> : <Card>
      <CardHeader><CardTitle>Danh sách BSC</CardTitle><CardDescription>{total} hồ sơ trong phạm vi truy cập.</CardDescription></CardHeader>
      <CardContent><Table className="min-w-[960px]"><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Phòng ban</TableHead><TableHead>Kế hoạch</TableHead><TableHead>Đánh giá</TableHead><TableHead>Điểm chính thức</TableHead><TableHead>Xếp loại chính thức</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.bsc_cycles.name}</TableCell><TableCell>{item.departments.name}</TableCell><TableCell><Status value={item.plan_status}/></TableCell><TableCell><Status value={item.evaluation_status}/></TableCell><TableCell>{item.evaluation_status === 'APPROVED' ? item.final_score ?? '—' : '—'}</TableCell><TableCell>{item.evaluation_status === 'APPROVED' ? item.final_grade ?? '—' : '—'}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1 whitespace-nowrap">
          <Button asChild variant="outline" size="icon-sm"><Link to={`/department-bsc/${item.id}`} aria-label="Xem chi tiết" title="Xem chi tiết"><EyeIcon data-icon="inline-start"/></Link></Button>
          {permissions.includes(P.EXPORT) && <Button variant="outline" size="icon-sm" aria-label="Xuất Excel" title="Xuất Excel" disabled={exportingId === item.id} onClick={() => void exportExcel(item)}>{exportingId === item.id ? <Spinner/> : <FileSpreadsheetIcon data-icon="inline-start"/>}</Button>}
          {permissions.includes(P.DUPLICATE) && <Button variant="outline" size="icon-sm" aria-label="Sao chép BSC" title="Sao chép BSC" onClick={() => void openDuplicate(item)}><CopyIcon data-icon="inline-start"/></Button>}
        </div></TableCell></TableRow>)}</TableBody>
      </Table></CardContent><CardFooter><Pagination page={page} total={total} limit={20} onChange={setPage}/></CardFooter>
    </Card>}
    <AccessibleDialog open={Boolean(duplicateSource)} title="Sao chép BSC phòng ban" description="BSC mới kế thừa cấu trúc KPI từ phiên kế hoạch được duyệt đầu tiên; nếu chưa có phiên duyệt thì tạo BSC trắng. Kết quả đánh giá không được sao chép." onClose={closeDuplicate} busy={duplicateBusy}>
      {duplicateLoading ? <LoadingState/> : <>
        {duplicateError && <ErrorState error={duplicateError}/>} 
        {!duplicateError && duplicateCycles.length === 0 ? <EmptyState message="Không có kỳ BSC đang mở phù hợp để sao chép."/> : duplicateCycles.length > 0 && <FieldGroup><Field><FieldLabel htmlFor="department-duplicate-cycle">Kỳ đích</FieldLabel><Select value={duplicateCycleId} onValueChange={setDuplicateCycleId}><SelectTrigger id="department-duplicate-cycle"><SelectValue placeholder="Chọn kỳ đích"/></SelectTrigger><SelectContent><SelectGroup>{duplicateCycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup>}
        <div className="flex flex-wrap justify-end gap-2">{duplicateCycles.length > 0 && <Button disabled={!duplicateCycleId || duplicateBusy} onClick={() => void duplicate()}>{duplicateBusy && <Spinner data-icon="inline-start"/>}{duplicateBusy ? 'Đang sao chép…' : 'Xác nhận sao chép'}</Button>}<Button variant="outline" disabled={duplicateBusy} onClick={closeDuplicate}>Hủy</Button></div>
      </>}
    </AccessibleDialog>
  </main>;
};

export const DepartmentBscCreatePage: React.FC = () => {
  const [cycles, setCycles] = useState<BscCycle[]>([]), [cycleId, setCycleId] = useState(''), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { bscCyclesApi.open().then((rows) => { setCycles(rows); setCycleId(rows[0]?.id ?? ''); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải kỳ BSC.')).finally(() => setLoading(false)); }, []);
  const submit = async () => { setSaving(true); setError(''); try { const created = await departmentBscApi.create(cycleId); navigate(`/department-bsc/${created.id}`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tạo BSC phòng ban.'); } finally { setSaving(false); } };
  return <main className="flex flex-col gap-6"><PageHeader title="Tạo BSC phòng ban" breadcrumb={<Link to="/department-bsc">BSC phòng ban</Link>}/>
    {error && <ErrorState error={error}/>} {loading ? <LoadingState/> : cycles.length === 0 ? <EmptyState message="Không có kỳ BSC đang mở."/> : <Card>
      <CardHeader><CardTitle>Chọn kỳ BSC</CardTitle><CardDescription>Hệ thống tự xác định phòng ban, trưởng phòng chịu trách nhiệm và Giám đốc duyệt.</CardDescription></CardHeader>
      <CardContent><FieldGroup><Field><FieldLabel htmlFor="department-cycle">Kỳ BSC</FieldLabel><Select value={cycleId} onValueChange={setCycleId}><SelectTrigger id="department-cycle"><SelectValue placeholder="Chọn kỳ"/></SelectTrigger><SelectContent><SelectGroup>{cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name} — {cycle.month ? `${cycle.month}/${cycle.year}` : cycle.year}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Mỗi phòng ban chỉ có một BSC trong một kỳ.</FieldDescription></Field></FieldGroup></CardContent>
      <CardFooter className="justify-end gap-2"><Button asChild variant="outline"><Link to="/department-bsc">Hủy</Link></Button><Button disabled={!cycleId || saving} onClick={() => void submit()}>{saving && <Spinner data-icon="inline-start"/>}{saving ? 'Đang tạo…' : 'Tạo BSC'}</Button></CardFooter>
    </Card>}
  </main>;
};

export const DepartmentBscPendingReviewPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStage = searchParams.get('stage');
  const [stage, setStage] = useState<'PLAN' | 'EVALUATION' | 'REOPEN'>(
    initialStage === 'EVALUATION' || initialStage === 'REOPEN' ? initialStage : 'PLAN',
  ), [items, setItems] = useState<DepartmentBsc[]>([]), [reopens, setReopens] = useState<DepartmentBscReopenRequest[]>([]), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [busyAction, setBusyAction] = useState(''), [reason, setReason] = useState('');
  const busy = Boolean(busyAction);
  const load = useCallback(async () => { setLoading(true); setError(''); try {
    if (stage === 'REOPEN') { setReopens(await departmentBscApi.pendingReopen()); setItems([]); }
    else { const result = await departmentBscApi.pendingReview({ stage, page: 1, limit: 100 }); setItems(result.items); setReopens([]); }
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải hàng chờ duyệt.'); } finally { setLoading(false); } }, [stage]);
  useEffect(() => { void load(); }, [load]);
  const reviewReopen = async (requestId: string, action: 'APPROVE' | 'REJECT') => { setBusyAction(`${requestId}:${action}`); setError(''); try {
    if (action === 'APPROVE') await departmentBscApi.approveReopen(requestId); else await departmentBscApi.rejectReopen(requestId, reason);
    setReason(''); await load();
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu mở lại.'); } finally { setBusyAction(''); } };
  return <main className="flex flex-col gap-6"><PageHeader title="BSC phòng ban chờ duyệt" description="Giám đốc xử lý độc lập giai đoạn kế hoạch và đánh giá." action={<Button asChild variant="outline"><Link to="/department-bsc"><ArrowLeftIcon data-icon="inline-start"/>Danh sách</Link></Button>}/>
    <Card><CardHeader><CardTitle>Bộ lọc xử lý</CardTitle><CardDescription>Chọn giai đoạn và nhập lý do khi từ chối yêu cầu mở lại.</CardDescription></CardHeader><CardContent><FieldGroup className="grid lg:grid-cols-2">
      <Field><FieldLabel htmlFor="review-stage">Giai đoạn</FieldLabel><Select value={stage} onValueChange={(value) => {
        setStage(value as 'PLAN' | 'EVALUATION' | 'REOPEN');
        setSearchParams({ stage: value });
      }}><SelectTrigger id="review-stage" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="PLAN">Kế hoạch</SelectItem><SelectItem value="EVALUATION">Đánh giá</SelectItem><SelectItem value="REOPEN">Yêu cầu mở lại</SelectItem></SelectGroup></SelectContent></Select></Field>
      {stage === 'REOPEN' && <Field><FieldLabel htmlFor="reopen-review-reason">Lý do từ chối</FieldLabel><Textarea id="reopen-review-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bắt buộc khi từ chối"/></Field>}
    </FieldGroup></CardContent></Card>
    {error && <ErrorState error={error}/>} {loading ? <LoadingState/> : stage === 'REOPEN' ? (reopens.length === 0 ? <EmptyState message="Không có yêu cầu mở lại đang chờ xử lý."/> : <Card><CardHeader><CardTitle>Yêu cầu mở lại</CardTitle><CardDescription>{reopens.length} yêu cầu cần xử lý.</CardDescription></CardHeader><CardContent><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Giai đoạn</TableHead><TableHead>Lý do</TableHead><TableHead>Ngày yêu cầu</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{reopens.map((request) => <TableRow key={request.id}><TableCell>{bscStageLabel(request.stage)}</TableCell><TableCell className="max-w-80 whitespace-normal">{request.request_reason}</TableCell><TableCell>{formatDate(request.created_at)}</TableCell><TableCell><div className="flex justify-end gap-2"><Button asChild variant="outline" size="sm"><Link to={`/department-bsc/${request.department_bsc_id}`}>Xem BSC</Link></Button><Button variant="outline" size="sm" disabled={busy || !reason.trim()} onClick={() => void reviewReopen(request.id, 'REJECT')}>{busyAction === `${request.id}:REJECT` && <Spinner data-icon="inline-start"/>}Từ chối</Button><Button size="sm" disabled={busy} onClick={() => void reviewReopen(request.id, 'APPROVE')}>{busyAction === `${request.id}:APPROVE` && <Spinner data-icon="inline-start"/>}Chấp thuận</Button></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>) : items.length === 0 ? <EmptyState message={`Không có BSC phòng ban chờ duyệt ${bscStageLabel(stage).toLowerCase()}.`}/> : <Card><CardHeader><CardTitle>Duyệt {bscStageLabel(stage).toLowerCase()}</CardTitle><CardDescription>{items.length} BSC cần xử lý.</CardDescription></CardHeader><CardContent><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Phòng ban</TableHead><TableHead>Trưởng phòng</TableHead><TableHead>Ngày nộp</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{item.bsc_cycles.name}</TableCell><TableCell>{item.departments.name}</TableCell><TableCell>{item.responsible_manager.full_name}</TableCell><TableCell>{formatDate(stage === 'PLAN' ? item.plan_submitted_at : item.evaluation_submitted_at)}</TableCell><TableCell className="text-right"><Button asChild size="sm"><Link to={`/department-bsc/${item.id}`}>Xử lý</Link></Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
  </main>;
};

export const DepartmentBscDetailPage: React.FC = () => {
  const { id = '' } = useParams(), navigate = useNavigate();
  const { user } = useAuth(); const permissions = user?.permissions ?? [];
  const [bsc, setBsc] = useState<DepartmentBsc | null>(null), [scoring, setScoring] = useState<DepartmentBscScoring | null>(null), [versions, setVersions] = useState<DepartmentBscVersion[]>([]);
  const [cycles, setCycles] = useState<BscCycle[]>([]), [duplicateCycle, setDuplicateCycle] = useState(''), [returnReason, setReturnReason] = useState(''), [reopenReason, setReopenReason] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [detail, preview, openCycles] = await Promise.all([departmentBscApi.detail(id), departmentBscApi.scoringPreview(id), bscCyclesApi.open()]); setBsc(detail); setScoring(preview); setCycles(openCycles.filter((cycle) => cycle.id !== detail.cycle_id)); if (permissions.includes(P.VIEW_VERSION)) setVersions(await departmentBscApi.versions(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải BSC phòng ban.'); } finally { setLoading(false); } }, [id, permissions]);
  useEffect(() => { void load(); }, [load]);
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(''); try { await action(); setReturnReason(''); setReopenReason(''); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xử lý BSC phòng ban.'); } finally { setBusy(false); } };
  const isOwner = permissions.includes(P.EDIT);
  const canPlanEdit = Boolean(bsc && isOwner && permissions.includes(P.EDIT) && ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status) && bsc.evaluation_status === 'NOT_STARTED');
  const canActual = Boolean(bsc && isOwner && permissions.includes(P.EDIT) && bsc.plan_status === 'APPROVED' && ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status));
  const groupedItems = useMemo(() => bsc?.department_bsc_items ?? [], [bsc]);
  if (loading && !bsc) return <LoadingState/>;
  if (!bsc) return <main className="flex flex-col gap-4"><ErrorState error={error || 'Không tìm thấy BSC phòng ban.'}/><Button asChild variant="outline"><Link to="/department-bsc">Quay lại</Link></Button></main>;
  const reopenHistory = bsc.department_bsc_status_histories.filter((history) => history.action.includes('REOPEN'));
  const statusHistory = bsc.department_bsc_status_histories.filter((history) => !history.action.includes('REOPEN'));
  return <main aria-label="Chi tiết BSC phòng ban" className="flex flex-col gap-5">
    <PageHeader title={bsc.bsc_code} description={`${bsc.departments.name} · ${bsc.bsc_cycles.name} · Trưởng phòng: ${bsc.responsible_manager.full_name}`} breadcrumb={<Link to="/department-bsc">BSC phòng ban</Link>}>
      <div className="mt-3 flex flex-wrap gap-3 text-sm"><span className="flex items-center gap-2"><span className="text-muted-foreground">Kế hoạch</span><Status value={bsc.plan_status}/></span><span className="flex items-center gap-2"><span className="text-muted-foreground">Đánh giá</span><Status value={bsc.evaluation_status}/></span></div>
    </PageHeader>
    {error && <ErrorState error={error}/>}<WorkflowActions bsc={bsc} permissions={permissions} busy={busy} isOwner={isOwner} returnReason={returnReason} setReturnReason={setReturnReason} run={run} navigate={navigate}/>
    <KpiTable bsc={bsc} items={groupedItems} scoring={scoring} canPlanEdit={canPlanEdit} canActual={canActual} busy={busy} run={run}/>
    {((permissions.includes(P.DUPLICATE) && versions.length > 0) || (permissions.includes(P.REQUEST_REOPEN) && (bsc.plan_status === 'APPROVED' || bsc.evaluation_status === 'APPROVED'))) && <Card><CardHeader><CardTitle>Sao chép và yêu cầu chỉnh sửa</CardTitle><CardDescription>Sao chép chỉ kế thừa cấu trúc KPI; yêu cầu chỉnh sửa vẫn giữ nguyên lịch sử đã duyệt.</CardDescription></CardHeader><CardContent><FieldGroup>
      {permissions.includes(P.DUPLICATE) && cycles.length > 0 && <Field><FieldLabel htmlFor="duplicate-cycle">Kỳ đích</FieldLabel><Select value={duplicateCycle} onValueChange={setDuplicateCycle}><SelectTrigger id="duplicate-cycle"><SelectValue placeholder="Chọn kỳ đích"/></SelectTrigger><SelectContent><SelectGroup>{cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
      {permissions.includes(P.REQUEST_REOPEN) && (bsc.plan_status === 'APPROVED' || bsc.evaluation_status === 'APPROVED') && <Field><FieldLabel htmlFor="reopen-reason">Lý do mở lại</FieldLabel><Textarea id="reopen-reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)}/></Field>}
    </FieldGroup></CardContent><CardFooter className="justify-end gap-2">{permissions.includes(P.DUPLICATE) && <Button variant="outline" disabled={!duplicateCycle || busy} onClick={() => void run(async () => { const created = await departmentBscApi.duplicate(bsc.id, duplicateCycle); navigate(`/department-bsc/${created.id}`); })}><CopyIcon data-icon="inline-start"/>Sao chép BSC</Button>}{permissions.includes(P.REQUEST_REOPEN) && bsc.evaluation_status === 'APPROVED' && <Button disabled={!reopenReason.trim() || busy} onClick={() => void run(() => departmentBscApi.requestReopen(bsc.id, 'EVALUATION', reopenReason))}>Yêu cầu sửa đánh giá</Button>}{permissions.includes(P.REQUEST_REOPEN) && bsc.plan_status === 'APPROVED' && <Button disabled={!reopenReason.trim() || busy} onClick={() => void run(() => departmentBscApi.requestReopen(bsc.id, 'PLAN', reopenReason))}>Yêu cầu sửa kế hoạch</Button>}</CardFooter></Card>}
    <Card><CardHeader><CardTitle>Lịch sử phiên bản</CardTitle></CardHeader><CardContent>{versions.length === 0 ? <EmptyState message="Chưa có phiên bản đã duyệt."/> : <Table><TableHeader><TableRow><TableHead>Phiên bản</TableHead><TableHead>Giai đoạn</TableHead><TableHead>Loại phiên bản</TableHead><TableHead>Thời gian</TableHead></TableRow></TableHeader><TableBody>{versions.map((version) => <TableRow key={version.id}><TableCell>#{version.version_number}</TableCell><TableCell>{bscStageLabel(version.stage)}</TableCell><TableCell>{versionTypeLabel(version.version_type)}</TableCell><TableCell>{formatDate(version.created_at)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Lịch sử yêu cầu mở lại</CardTitle></CardHeader><CardContent>{reopenHistory.length === 0 ? <EmptyState message="Chưa có yêu cầu mở lại."/> : <Table><TableHeader><TableRow><TableHead>Giai đoạn</TableHead><TableHead>Trạng thái</TableHead><TableHead>Lý do</TableHead><TableHead>Thời gian</TableHead></TableRow></TableHeader><TableBody>{reopenHistory.map((history) => <TableRow key={history.id}><TableCell>{bscStageLabel(history.stage)}</TableCell><TableCell><Status value={history.to_status}/></TableCell><TableCell>{history.comment || '—'}</TableCell><TableCell>{formatDate(history.changed_at)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Lịch sử trạng thái</CardTitle></CardHeader><CardContent>{statusHistory.length === 0 ? <EmptyState message="Chưa có thay đổi trạng thái."/> : <Table><TableHeader><TableRow><TableHead>Giai đoạn</TableHead><TableHead>Trạng thái</TableHead><TableHead>Nội dung</TableHead><TableHead>Thời gian</TableHead></TableRow></TableHeader><TableBody>{statusHistory.map((history) => <TableRow key={history.id}><TableCell>{bscStageLabel(history.stage)}</TableCell><TableCell><Status value={history.to_status}/></TableCell><TableCell>{history.comment || '—'}</TableCell><TableCell>{formatDate(history.changed_at)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </main>;
};

function WorkflowActions({ bsc, permissions, busy, isOwner, returnReason, setReturnReason, run, navigate }: { bsc: DepartmentBsc; permissions: string[]; busy: boolean; isOwner: boolean; returnReason: string; setReturnReason: (value: string) => void; run: (action: () => Promise<unknown>) => Promise<void>; navigate: ReturnType<typeof useNavigate> }) {
  const confirm = useSystemConfirm();
  const [editingComment, setEditingComment] = useState(false), [comment, setComment] = useState(bsc.manager_comment ?? '');
  const canSubmitPlan = isOwner && permissions.includes(P.SUBMIT_PLAN) && ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status);
  const canSubmitEvaluation = isOwner && permissions.includes(P.SUBMIT_EVALUATION) && bsc.plan_status === 'APPROVED' && ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status);
  const planReview = bsc.plan_status === 'SUBMITTED' && (permissions.includes(P.APPROVE_PLAN) || permissions.includes(P.RETURN_PLAN));
  const evaluationReview = bsc.evaluation_status === 'SUBMITTED' && (permissions.includes(P.APPROVE_EVALUATION) || permissions.includes(P.RETURN_EVALUATION));
  const canDelete = isOwner && permissions.includes(P.DELETE_DRAFT) && bsc.plan_status === 'DRAFT' && bsc.evaluation_status === 'NOT_STARTED';
  const totalWeight = bsc.department_bsc_items.reduce((sum, item) => sum + Number(item.weight), 0);
  const planComplete = bsc.department_bsc_items.length > 0 && Math.abs(totalWeight - 100) < 0.000001;
  return <Card><CardContent className="flex flex-col gap-4 py-3"><div className="flex flex-wrap items-center gap-2">
    {isOwner && permissions.includes(P.EDIT) && <Button variant="ghost" onClick={() => setEditingComment((value) => !value)}>Sửa ghi chú</Button>}
    {canDelete && <Button variant="outline" disabled={busy} onClick={async () => { if (await confirm({ title: 'Xóa BSC?', description: 'BSC nháp và toàn bộ KPI bên trong sẽ bị xóa.', confirmLabel: 'Xóa BSC', tone: 'destructive' })) { await departmentBscApi.delete(bsc.id); navigate('/department-bsc'); } }}>Xóa BSC</Button>}
    {canSubmitPlan && <Button variant="outline" disabled={busy || !planComplete} title={!planComplete ? 'Tổng tỷ trọng KPI phải bằng 100%' : undefined} onClick={() => void run(() => departmentBscApi.submitPlan(bsc.id))}>Gửi duyệt kế hoạch</Button>}{canSubmitEvaluation && <Button variant="outline" disabled={busy} onClick={() => void run(() => departmentBscApi.submitEvaluation(bsc.id))}>Gửi duyệt đánh giá</Button>}
    {planReview && permissions.includes(P.RETURN_PLAN) && <Button variant="outline" disabled={busy || !returnReason.trim()} onClick={() => void run(() => departmentBscApi.returnPlan(bsc.id, returnReason))}>Trả lại kế hoạch</Button>}{planReview && permissions.includes(P.APPROVE_PLAN) && <Button disabled={busy} onClick={() => void run(() => departmentBscApi.approvePlan(bsc.id))}>Duyệt kế hoạch</Button>}
    {evaluationReview && permissions.includes(P.RETURN_EVALUATION) && <Button variant="outline" disabled={busy || !returnReason.trim()} onClick={() => void run(() => departmentBscApi.returnEvaluation(bsc.id, returnReason))}>Trả lại đánh giá</Button>}{evaluationReview && permissions.includes(P.APPROVE_EVALUATION) && <Button disabled={busy} onClick={() => void run(() => departmentBscApi.approveEvaluation(bsc.id))}>Duyệt đánh giá</Button>}
  </div>{editingComment && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => departmentBscApi.update(bsc.id, comment)).then(() => setEditingComment(false)); }}><Field><FieldLabel htmlFor="manager-comment">Ghi chú</FieldLabel><Textarea id="manager-comment" value={comment} onChange={(event) => setComment(event.target.value)}/></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingComment(false)}>Hủy</Button><Button type="submit" disabled={busy}>Lưu ghi chú</Button></div></form>}{(planReview || evaluationReview) && <Field><FieldLabel htmlFor="return-reason">Lý do trả lại</FieldLabel><Textarea id="return-reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Bắt buộc khi trả lại"/></Field>}</CardContent></Card>;
}

function KpiCreateForm({ bsc, goalGroupCode, busy, cancel, run }: { bsc: DepartmentBsc; goalGroupCode: string; busy: boolean; cancel: () => void; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const group = bsc.goal_groups.find((item) => item.code === goalGroupCode);
  const prefix = `new-${goalGroupCode}`;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const form = event.currentTarget;
    void run(() => departmentBscApi.createItem(bsc.id, { kpiCode: `DKPI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, description: String(data.get('description') ?? ''), kpiName: String(data.get('kpiName') ?? ''), targetValue: Number(data.get('targetValue')), weight: Number(data.get('weight')), goalGroupCode, measurementUnit: '%', measurementFrequency: 'Tháng', calculationMethod: 'ACTUAL_DIV_TARGET', sortOrder: bsc.department_bsc_items.length })).then(() => { form.reset(); cancel(); }); };
  return <form onSubmit={submit} className="flex flex-col gap-5 py-2">
    <p className="font-medium">{group?.marker}. {group?.name}</p>
    <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Field><FieldLabel htmlFor={`${prefix}-kpo`}>Mục tiêu chiến lược (KPO)</FieldLabel><Input id={`${prefix}-kpo`} name="description" required/></Field>
      <Field><FieldLabel htmlFor={`${prefix}-kpi`}>Đo lường hiệu suất (KPI)</FieldLabel><Input id={`${prefix}-kpi`} name="kpiName" required/></Field>
      <Field data-disabled><FieldLabel htmlFor={`${prefix}-unit`}>Đơn vị tính</FieldLabel><Input id={`${prefix}-unit`} value="%" disabled/></Field>
      <Field><FieldLabel htmlFor={`${prefix}-target`}>Chỉ tiêu</FieldLabel><Input id={`${prefix}-target`} name="targetValue" type="number" step="any" defaultValue={100} required/></Field>
      <Field><FieldLabel htmlFor={`${prefix}-weight`}>Tỷ trọng (%)</FieldLabel><Input id={`${prefix}-weight`} name="weight" type="number" min="0.01" max="100" step="0.01" required/></Field>
      <Field data-disabled><FieldLabel htmlFor={`${prefix}-frequency`}>Tần suất đo</FieldLabel><Input id={`${prefix}-frequency`} value="Tháng" disabled/></Field>
    </FieldGroup>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={cancel}><XIcon data-icon="inline-start"/>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu KPI'}</Button></div>
  </form>;
}

function KpiTable({ bsc, items, scoring, canPlanEdit, canActual, busy, run }: { bsc: DepartmentBsc; items: DepartmentBscItem[]; scoring: DepartmentBscScoring | null; canPlanEdit: boolean; canActual: boolean; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const confirm = useSystemConfirm();
  const [editingId, setEditingId] = useState<string | null>(null), [actualId, setActualId] = useState<string | null>(null), [createGroupCode, setCreateGroupCode] = useState<string | null>(null);
  const scoreByItem = new Map(scoring?.items.map((item) => [item.itemId, item]) ?? []);
  const groups = [...bsc.goal_groups].sort((a, b) => a.displayOrder - b.displayOrder);
  const totalWeight = Number(items.reduce((sum, item) => sum + Number(item.weight), 0).toFixed(6));
  const isOfficial = bsc.evaluation_status === 'APPROVED';
  const itemsForGroup = (code: string, index: number) => items.filter((item) => item.goal_group_code === code || (index === 0 && !item.goal_group_code));
  return <Card><CardHeader><div className="flex flex-wrap items-end justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle>Bảng giao mục tiêu và đánh giá kết quả hoạt động</CardTitle><CardDescription>Nhóm mục tiêu được cố định theo mẫu BSC. Chọn dấu + để thêm KPO/KPI vào đúng nhóm.</CardDescription></div><div className="flex flex-wrap items-center justify-end gap-2 text-sm"><span>{items.length} KPI</span><Badge variant={totalWeight === 100 ? 'secondary' : 'destructive'}>Tổng tỷ trọng A + B: {totalWeight}%</Badge>{canPlanEdit && totalWeight !== 100 && <span className="text-muted-foreground">{totalWeight < 100 ? `Còn thiếu ${100 - totalWeight}%` : `Đang vượt ${totalWeight - 100}%`}</span>}</div></div></CardHeader><CardContent><div className="rounded-lg border"><Table className="min-w-[1450px] border-collapse [&_td]:border-r [&_th]:border-r [&_tr>*:last-child]:border-r-0"><TableHeader><TableRow><TableHead className="w-12 text-center">STT</TableHead><TableHead>Mục tiêu chiến lược (KPO)</TableHead><TableHead>Đo lường hiệu suất (KPI)</TableHead><TableHead>ĐVT</TableHead><TableHead>Chỉ tiêu</TableHead><TableHead>% Tỷ trọng</TableHead><TableHead>Tần suất đo</TableHead><TableHead>Kết quả thực hiện</TableHead><TableHead>Tỉ lệ hoàn thành</TableHead><TableHead>Điểm công việc</TableHead><TableHead>Điểm trọng số</TableHead><TableHead>TM KQTH</TableHead><TableHead className="w-28 text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{groups.map((group, groupIndex) => { const groupItems = itemsForGroup(group.code, groupIndex); const groupWeight = Number(groupItems.reduce((sum, item) => sum + Number(item.weight), 0).toFixed(6)); return <React.Fragment key={group.code}><TableRow className="bg-muted/50 hover:bg-muted/50"><TableCell className="text-center font-semibold">{group.marker}</TableCell><TableHead scope="row" colSpan={4} className="h-auto whitespace-normal py-3 font-semibold">{group.name}</TableHead><TableCell className="bg-primary/10 text-center font-bold text-primary tabular-nums">{groupWeight}%</TableCell><TableCell colSpan={6}/><TableCell className="text-right">{canPlanEdit && <Button variant="ghost" size="icon-sm" aria-label={`Thêm KPI vào ${group.name}`} title={`Thêm KPI vào ${group.name}`} onClick={() => setCreateGroupCode(createGroupCode === group.code ? null : group.code)}><PlusIcon data-icon="inline-start"/></Button>}</TableCell></TableRow>{createGroupCode === group.code && <TableRow><TableCell colSpan={13}><KpiCreateForm bsc={bsc} goalGroupCode={group.code} busy={busy} cancel={() => setCreateGroupCode(null)} run={run}/></TableCell></TableRow>}{groupItems.map((item, itemIndex) => { const score = scoreByItem.get(item.id); return <React.Fragment key={item.id}><TableRow><TableCell className="text-center text-muted-foreground">{itemIndex + 1}</TableCell><TableCell className="max-w-64 whitespace-normal">{item.description || '—'}</TableCell><TableCell className="max-w-72 whitespace-normal"><strong>{item.kpi_name}</strong></TableCell><TableCell>{item.measurement_unit || '—'}</TableCell><TableCell>{item.target_value ?? item.target_text ?? '—'}</TableCell><TableCell>{item.weight}%</TableCell><TableCell>{item.measurement_frequency || '—'}</TableCell><TableCell>{item.actual_value ?? item.actual_text ?? '—'}</TableCell><TableCell>{score?.roundedAchievementPercentage == null ? '—' : `${score.roundedAchievementPercentage}%`}</TableCell><TableCell>{score?.roundedWorkScore ?? '—'}</TableCell><TableCell>{score?.weightedScore ?? '—'}</TableCell><TableCell className="max-w-56 whitespace-normal">{item.manager_note || '—'}</TableCell><TableCell><div className="flex justify-end gap-1">{canPlanEdit && <><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Sửa ${item.kpi_name}`} onClick={() => setEditingId(editingId === item.id ? null : item.id)}><PencilIcon data-icon="inline-start"/></Button><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Xóa ${item.kpi_name}`} onClick={async () => { if (await confirm({ title: 'Xóa KPI?', description: item.kpi_name, confirmLabel: 'Xóa', tone: 'destructive' })) await run(() => departmentBscApi.deleteItem(bsc.id, item.id)); }}><Trash2Icon data-icon="inline-start"/></Button></>}{canActual && <Button variant="outline" size="sm" onClick={() => setActualId(actualId === item.id ? null : item.id)}>Nhập kết quả</Button>}</div></TableCell></TableRow>{editingId === item.id && <TableRow><TableCell colSpan={13}><KpiEditForm bsc={bsc} item={item} busy={busy} cancel={() => setEditingId(null)} save={(payload) => run(() => departmentBscApi.updateItem(bsc.id, item.id, payload)).then(() => setEditingId(null))}/></TableCell></TableRow>}{actualId === item.id && <TableRow><TableCell colSpan={13}><ActualForm item={item} busy={busy} cancel={() => setActualId(null)} save={(payload) => run(() => departmentBscApi.updateActual(bsc.id, item.id, payload)).then(() => setActualId(null))}/></TableCell></TableRow>}</React.Fragment>; })}</React.Fragment>; })}</TableBody><TableFooter><TableRow><TableHead scope="row" colSpan={10} className="h-auto py-3"><strong>ĐIỂM ĐÁNH GIÁ {isOfficial ? 'CHÍNH THỨC' : 'DỰ KIẾN'}</strong></TableHead><TableCell><strong>{isOfficial ? bsc.final_score ?? '—' : scoring?.totalWeightedScore ?? 0}</strong></TableCell><TableCell colSpan={2}/></TableRow><TableRow><TableHead scope="row" colSpan={10} className="h-auto py-3"><strong>LOẠI THÀNH TÍCH {isOfficial ? 'CHÍNH THỨC' : 'DỰ KIẾN'}</strong></TableHead><TableCell colSpan={3}>{(isOfficial ? bsc.final_grade : scoring?.classification) ? <Badge variant="secondary">{isOfficial ? bsc.final_grade : scoring?.classification}</Badge> : <span className="text-muted-foreground">Chưa đủ dữ liệu</span>}</TableCell></TableRow></TableFooter></Table></div></CardContent></Card>;
}

function KpiEditForm({ bsc, item, busy, cancel, save }: { bsc: DepartmentBsc; item: DepartmentBscItem; busy: boolean; cancel: () => void; save: (payload: unknown) => Promise<void> }) {
  const [goalGroupCode, setGoalGroupCode] = useState(item.goal_group_code), [calculationMethod, setCalculationMethod] = useState(item.calculation_method);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void save({ description: String(data.get('description') ?? ''), kpiName: String(data.get('kpiName') ?? ''), targetValue: Number(data.get('targetValue')), weight: Number(data.get('weight')), measurementUnit: String(data.get('measurementUnit') ?? ''), measurementFrequency: String(data.get('measurementFrequency') ?? ''), goalGroupCode, calculationMethod }); };
  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Input name="description" defaultValue={item.description ?? ''} aria-label="KPO" required/><Input name="kpiName" defaultValue={item.kpi_name} aria-label="KPI" required/><Input name="targetValue" type="number" step="any" defaultValue={item.target_value ?? ''} aria-label="Chỉ tiêu" required/><Input name="weight" type="number" min="0.01" max="100" step="0.01" defaultValue={item.weight} aria-label="Trọng số" required/><Input name="measurementUnit" defaultValue={item.measurement_unit} aria-label="Đơn vị tính" required/><Input name="measurementFrequency" defaultValue={item.measurement_frequency} aria-label="Tần suất đo" required/><Select value={goalGroupCode} onValueChange={setGoalGroupCode}><SelectTrigger aria-label="Nhóm mục tiêu"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{bsc.goal_groups.map((group) => <SelectItem key={group.code} value={group.code}>{group.name}</SelectItem>)}</SelectGroup></SelectContent></Select><Select value={calculationMethod} onValueChange={setCalculationMethod}><SelectTrigger aria-label="Cách tính"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ACTUAL_DIV_TARGET">Càng cao càng tốt</SelectItem><SelectItem value="TARGET_DIV_ACTUAL">Càng thấp càng tốt</SelectItem><SelectItem value="BINARY">Đạt / không đạt</SelectItem></SelectGroup></SelectContent></Select><div className="flex gap-2 xl:col-span-4 xl:justify-end"><Button type="button" variant="outline" onClick={cancel}>Hủy</Button><Button type="submit" disabled={busy}>Lưu KPI</Button></div></form>;
}

function ActualForm({ item, busy, cancel, save }: { item: DepartmentBscItem; busy: boolean; cancel: () => void; save: (payload: unknown) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void save({ actualValue: Number(data.get('actualValue')), managerNote: String(data.get('managerNote') ?? '') }); };
  return <form onSubmit={submit} className="flex flex-col gap-4 py-2"><FieldGroup className="grid gap-3 md:grid-cols-2"><Field><FieldLabel htmlFor={`actual-${item.id}`}>Kết quả thực hiện</FieldLabel><Input id={`actual-${item.id}`} name="actualValue" type="number" step="any" defaultValue={item.actual_value ?? ''} required/></Field><Field><FieldLabel htmlFor={`note-${item.id}`}>TM KQTH</FieldLabel><Input id={`note-${item.id}`} name="managerNote" defaultValue={item.manager_note ?? ''}/></Field></FieldGroup><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={cancel}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu kết quả'}</Button></div></form>;
}
