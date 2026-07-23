import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, LockKeyhole, Plus, RotateCcw } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../../components/ui/alert-dialog';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Textarea } from '../../../components/ui/textarea';
import { ApiError } from '../../../lib/http-client';
import { useAuth } from '../../auth/hooks/use-auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { BscCycle, bscCyclesApi, CyclePayload, CycleStatus } from '..';

const VN_ZONE = 'Asia/Ho_Chi_Minh';
const PAGE_SIZE = 20;
const statusLabel: Record<CycleStatus, string> = { DRAFT: 'Nháp', OPEN: 'Đang mở', LOCKED: 'Đang khóa', CLOSED: 'Đã đóng' };
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN_ZONE, dateStyle: 'short' }).format(new Date(value));
const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: VN_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa cấu hình';
const canAdmin = (permissions: string[]) => permissions.includes('bsc.period.view') || permissions.includes('bsc.period.manage');
const canManage = (permissions: string[]) => permissions.includes('bsc.period.manage');

const CycleStatusBadge: React.FC<{ status: CycleStatus }> = ({ status }) => <Badge variant={status === 'OPEN' ? 'default' : status === 'LOCKED' ? 'destructive' : status === 'CLOSED' ? 'secondary' : 'outline'}>{statusLabel[status]}</Badge>;

export const BscCyclesPage: React.FC = () => {
  const { user } = useAuth(), permissions = user?.permissions ?? [];
  const [items, setItems] = useState<BscCycle[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1);
  const [search, setSearch] = useState(''), [year, setYear] = useState(''), [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true); setError('');
    void bscCyclesApi.list({ search, year: year ? Number(year) : undefined, cycleType: 'MONTH', status, page, limit: PAGE_SIZE })
      .then(result => { setItems(result.items); setTotal(result.total); })
      .catch(e => setError(e instanceof Error ? e.message : 'Không thể tải kỳ BSC.'))
      .finally(() => setLoading(false));
  }, [search, year, status, page]);
  useEffect(load, [load]);
  if (!canAdmin(permissions)) return <Navigate to="/" replace />;

  return <main className="flex flex-col gap-6">
    <PageHeader title="Kỳ BSC" description="Quản lý các kỳ đánh giá tháng và chủ động mở, khóa hoặc kết thúc kỳ." action={canManage(permissions) && <Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" asChild><Link to="/management/bsc-cycles/new"><Plus data-icon="inline-start" />Tạo kỳ</Link></Button>} />
    <Card>
      <CardHeader><CardTitle>Bộ lọc</CardTitle><CardDescription>Tìm theo mã, tên, năm hoặc trạng thái vận hành.</CardDescription></CardHeader>
      <CardContent><FieldGroup className="grid md:grid-cols-3">
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} label="Tìm kỳ" />
        <Field><FieldLabel htmlFor="cycle-year">Năm</FieldLabel><Input id="cycle-year" type="number" placeholder="Ví dụ: 2026" value={year} onChange={e => { setYear(e.target.value); setPage(1); }} /></Field>
        <Field><FieldLabel htmlFor="cycle-status">Trạng thái</FieldLabel><Select value={status || 'ALL'} onValueChange={value => { setStatus(value === 'ALL' ? '' : value); setPage(1); }}><SelectTrigger id="cycle-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ALL">Tất cả trạng thái</SelectItem>{Object.entries(statusLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      </FieldGroup></CardContent>
    </Card>
    {loading ? <LoadingState message="Đang tải kỳ BSC…" /> : error ? <ErrorState error={error} onRetry={load} /> : items.length === 0 ? <EmptyState message="Chưa có kỳ BSC phù hợp với bộ lọc." action={canManage(permissions) && <Button asChild><Link to="/management/bsc-cycles/new">Tạo kỳ đầu tiên</Link></Button>} /> : <Card>
      <CardHeader><CardTitle>Danh sách kỳ</CardTitle><CardDescription>{total} kỳ phù hợp với bộ lọc hiện tại.</CardDescription></CardHeader>
      <CardContent>
        <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Ngày bắt đầu</TableHead><TableHead>Ngày kết thúc thực tế</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">BSC</TableHead></TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}><TableCell><Link className="font-medium underline-offset-4 hover:underline" to={`/management/bsc-cycles/${item.id}`}>{item.code} — {item.name}</Link></TableCell><TableCell>{formatDate(item.startDate)}</TableCell><TableCell>{item.endDate ? formatDate(item.endDate) : 'Chưa kết thúc'}</TableCell><TableCell><CycleStatusBadge status={item.status} /></TableCell><TableCell className="text-right">{item.summary?.totalBsc ?? 0}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex flex-col gap-3 md:hidden">{items.map(item => <Card key={item.id} size="sm"><CardHeader><CardTitle><Link className="underline-offset-4 hover:underline" to={`/management/bsc-cycles/${item.id}`}>{item.code} — {item.name}</Link></CardTitle><CardDescription>Bắt đầu {formatDate(item.startDate)}</CardDescription></CardHeader><CardContent className="flex items-center justify-between gap-3"><CycleStatusBadge status={item.status} /><span className="text-sm text-muted-foreground">{item.summary?.totalBsc ?? 0} BSC</span></CardContent></Card>)}</div>
      </CardContent>
      <CardFooter><Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} /></CardFooter>
    </Card>}
  </main>;
};

type FormState = Omit<CyclePayload, 'year' | 'month'> & { year: string; month: string };
const emptyForm = (): FormState => ({ code: '', name: '', cycleType: 'MONTH', year: String(new Date().getFullYear()), month: '', startDate: '' });
const formFromCycle = (cycle: BscCycle): FormState => ({ code: cycle.code, name: cycle.name, cycleType: 'MONTH', year: String(cycle.year), month: cycle.month ? String(cycle.month) : '', startDate: cycle.startDate.slice(0, 10) });
const payloadFromForm = (form: FormState): CyclePayload => ({ code: form.code.trim().toUpperCase(), name: form.name.trim(), cycleType: 'MONTH', year: Number(form.year), month: Number(form.month), startDate: form.startDate });

export const BscCycleFormPage: React.FC = () => {
  const { id } = useParams(), navigate = useNavigate(), { user } = useAuth(), permissions = user?.permissions ?? [];
  const [form, setForm] = useState<FormState>(emptyForm), [version, setVersion] = useState<number | null>(null), [loading, setLoading] = useState(Boolean(id)), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (!id) return; void bscCyclesApi.detail(id).then(cycle => { setForm(formFromCycle(cycle)); setVersion(cycle.version); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  if (!canManage(permissions)) return <Navigate to="/" replace />;
  const set = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const required = [form.code, form.name, form.year, form.month, form.startDate];
    if (required.some(value => value === '') || Number.isNaN(new Date(`${form.startDate}T00:00:00+07:00`).getTime())) return setError('Vui lòng nhập đầy đủ thông tin kỳ BSC.');
    setSaving(true);
    try { const saved = id && version ? await bscCyclesApi.update(id, { ...payloadFromForm(form), expectedVersion: version }) : await bscCyclesApi.create(payloadFromForm(form)); navigate(`/management/bsc-cycles/${saved.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu kỳ BSC.'); }
    finally { setSaving(false); }
  };
  if (loading) return <LoadingState />;
  return <main className="flex flex-col gap-6">
    <PageHeader title={id ? 'Chỉnh sửa kỳ BSC' : 'Tạo kỳ BSC'} description="Kỳ không có deadline; quản trị viên chủ động kết thúc trên trang chi tiết." breadcrumb={<Link to="/management/bsc-cycles">Danh sách kỳ BSC</Link>} />
    {error && <ErrorState error={error} />}
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card><CardHeader><CardTitle>Thông tin kỳ tháng</CardTitle><CardDescription>Tháng và ngày bắt đầu không thể đổi sau khi kỳ mở hoặc đã có BSC.</CardDescription></CardHeader><CardContent><FieldGroup className="grid md:grid-cols-2">
        <Field><FieldLabel htmlFor="cycle-code">Mã kỳ</FieldLabel><Input id="cycle-code" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} required /></Field>
        <Field><FieldLabel htmlFor="cycle-name">Tên kỳ</FieldLabel><Input id="cycle-name" value={form.name} onChange={e => set('name', e.target.value)} required /></Field>
        <Field><FieldLabel htmlFor="cycle-form-year">Năm</FieldLabel><Input id="cycle-form-year" type="number" value={form.year} onChange={e => set('year', e.target.value)} required /></Field>
        <Field><FieldLabel htmlFor="cycle-month">Tháng</FieldLabel><Input id="cycle-month" type="number" min="1" max="12" value={form.month} onChange={e => set('month', e.target.value)} required /></Field>
        <Field><FieldLabel htmlFor="cycle-start-date">Ngày bắt đầu</FieldLabel><Input id="cycle-start-date" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} required /><FieldDescription>Ngày hiệu lực của kỳ BSC theo múi giờ Việt Nam.</FieldDescription></Field>
      </FieldGroup></CardContent></Card>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" variant="outline" type="button" onClick={() => navigate(-1)}>Hủy</Button><Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" disabled={saving} type="submit">{saving && <Spinner data-icon="inline-start" />}{saving ? 'Đang lưu…' : 'Lưu kỳ'}</Button></div>
    </form>
  </main>;
};

export const BscCycleDetailPage: React.FC = () => {
  const { id = '' } = useParams(), { user } = useAuth(), permissions = user?.permissions ?? [], navigate = useNavigate();
  const [cycle, setCycle] = useState<BscCycle | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [acting, setActing] = useState(false);
  const load = useCallback(() => { setLoading(true); setError(''); void bscCyclesApi.detail(id).then(setCycle).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  useEffect(load, [load]);
  const actions = useMemo(() => cycle ? cycle.status === 'DRAFT' ? ['open'] as const : cycle.status === 'OPEN' ? ['lock', 'close'] as const : cycle.status === 'LOCKED' ? ['open', 'close'] as const : [] : [], [cycle]);
  if (!canAdmin(permissions)) return <Navigate to="/" replace />;
  const transition = async (action: 'open'|'lock'|'close', reason?: string) => {
    if (!cycle || acting) return; setActing(true); setError('');
    try { setCycle(await bscCyclesApi.transition(cycle.id, action, cycle.version, reason)); }
    catch (e) { setError(e instanceof ApiError && e.status === 409 ? 'Kỳ đã thay đổi ở nơi khác. Dữ liệu đang được tải lại.' : e instanceof Error ? e.message : 'Không thể đổi trạng thái.'); await load(); }
    finally { setActing(false); }
  };
  if (loading) return <LoadingState />;
  if (error && !cycle) return <ErrorState error={error} onRetry={load} />;
  if (!cycle) return null;
  const summary = cycle.summary ? { 'Tổng BSC': cycle.summary.totalBsc, 'Chưa tạo': cycle.summary.notCreated, 'Nháp': cycle.summary.draft, 'Chờ duyệt kế hoạch': cycle.summary.planSubmitted, 'Kế hoạch đã duyệt': cycle.summary.planApproved, 'Đang đánh giá': cycle.summary.evaluating, 'Chờ duyệt kết quả': cycle.summary.evaluationSubmitted, 'Kết quả đã duyệt': cycle.summary.evaluationApproved, 'Kế hoạch bị trả lại': cycle.summary.planReturned, 'Kết quả bị trả lại': cycle.summary.evaluationReturned } : null;

  return <main className="flex flex-col gap-6">
    <PageHeader title={`${cycle.code} — ${cycle.name}`} description="Theo dõi trạng thái vận hành và tiến độ BSC trong kỳ." breadcrumb={<Link to="/management/bsc-cycles">Danh sách kỳ BSC</Link>} action={canManage(permissions) && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{['DRAFT','OPEN'].includes(cycle.status) && <Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" variant="outline" onClick={() => navigate(`/management/bsc-cycles/${cycle.id}/edit`)}>Chỉnh sửa</Button>}{actions.map(action => <ConfirmAction key={action} action={action} disabled={acting} requireReason={action === 'close' || (cycle.status === 'LOCKED' && action === 'open')} onConfirm={reason => void transition(action, reason)} />)}</div>}><div className="mt-3"><CycleStatusBadge status={cycle.status} /></div></PageHeader>
    {error && <ErrorState error={error} />}
    <Card><CardHeader><CardTitle>Thông tin kỳ</CardTitle><CardDescription>Kỳ chỉ kết thúc khi quản trị viên xác nhận thao tác.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-sm text-muted-foreground">Loại kỳ</p><p className="font-medium">Tháng {cycle.month}/{cycle.year}</p></div>
      <div><p className="text-sm text-muted-foreground">Ngày bắt đầu</p><p className="font-medium">{formatDate(cycle.startDate)}</p></div>
      <div><p className="text-sm text-muted-foreground">Ngày kết thúc</p><p className="font-medium">{cycle.endDate ? formatDate(cycle.endDate) : 'Chưa kết thúc'}</p></div>
      <div><p className="text-sm text-muted-foreground">Cập nhật gần nhất</p><p className="font-medium">{formatTime(cycle.updatedAt)}</p></div>
    </CardContent><CardFooter className="text-sm text-muted-foreground">Người tạo: {cycle.createdBy?.fullName ?? '—'}</CardFooter></Card>
    {summary && <section aria-labelledby="cycle-summary-title"><div className="mb-4"><h2 id="cycle-summary-title" className="text-xl font-semibold">Tổng hợp BSC</h2><p className="text-sm text-muted-foreground">Tính từ trạng thái kế hoạch và kết quả đánh giá độc lập.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(summary).map(([label, value]) => <Card key={label} size="sm"><CardHeader><CardTitle className="text-2xl">{value}</CardTitle><CardDescription>{label}</CardDescription></CardHeader></Card>)}</div></section>}
  </main>;
};

function ConfirmAction({ action, disabled, requireReason = false, onConfirm }: { action: 'open'|'lock'|'close'; disabled: boolean; requireReason?: boolean; onConfirm: (reason?: string) => void }) {
  const [reason, setReason] = useState('');
  const config = {
    open: { label: 'Mở kỳ BSC', description: 'Kỳ mở cho phép chủ sở hữu tiếp tục workflow theo trạng thái từng giai đoạn.', icon: RotateCcw },
    lock: { label: 'Khóa kỳ BSC', description: 'Khóa kỳ sẽ tạm chặn chủ sở hữu tạo, sửa, nộp và duplicate vào kỳ này.', icon: LockKeyhole },
    close: { label: 'Kết thúc kỳ BSC', description: 'Kết thúc kỳ sẽ ghi nhận ngày kết thúc thực tế và đóng vĩnh viễn kỳ này.', icon: CalendarDays },
  }[action];
  const Icon = config.icon;
  return <AlertDialog><AlertDialogTrigger asChild><Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" disabled={disabled} variant={action === 'close' ? 'destructive' : 'outline'}><Icon data-icon="inline-start" />{config.label}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{config.label}?</AlertDialogTitle><AlertDialogDescription>{config.description}</AlertDialogDescription></AlertDialogHeader>{requireReason && <Field><FieldLabel htmlFor={`cycle-${action}-reason`}>{action === 'close' ? 'Lý do kết thúc' : 'Lý do mở lại'}</FieldLabel><Textarea id={`cycle-${action}-reason`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required /></Field>}<AlertDialogFooter><AlertDialogCancel className="min-h-11 sm:min-h-8">Hủy</AlertDialogCancel><AlertDialogAction className="min-h-11 sm:min-h-8" disabled={requireReason && !reason.trim()} onClick={() => onConfirm(reason.trim() || undefined)}>Xác nhận</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
