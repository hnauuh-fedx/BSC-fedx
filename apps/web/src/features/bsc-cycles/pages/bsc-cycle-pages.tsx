import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../../components/ui/alert-dialog';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Textarea } from '../../../components/ui/textarea';
import { useAuth } from '../../auth/hooks/use-auth';
import { ApiError } from '../../../lib/http-client';
import { BscCycle, bscCyclesApi, CyclePayload, CycleStatus } from '..';

const VN_ZONE = 'Asia/Ho_Chi_Minh';
const statusLabel: Record<CycleStatus, string> = { DRAFT: 'Nháp', OPEN: 'Đang mở', LOCKED: 'Đang khóa', CLOSED: 'Đã đóng' };
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN_ZONE, dateStyle: 'short' }).format(new Date(value));
const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: VN_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa cấu hình';
const toLocalInput = (value: string | null) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: VN_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(' ', 'T') : '';
const vnInputToIso = (value: string) => new Date(`${value}:00+07:00`).toISOString();
const canAdmin = (permissions: string[]) => permissions.includes('bsc.period.view') || permissions.includes('bsc.period.manage');
const canManage = (permissions: string[]) => permissions.includes('bsc.period.manage');

function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}{retry && <Button className="ml-3" variant="outline" size="sm" onClick={retry}>Thử lại</Button>}</div>;
}

export const BscCyclesPage: React.FC = () => {
  const { user } = useAuth(), permissions = user?.permissions ?? [];
  const [items, setItems] = useState<BscCycle[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1);
  const [search, setSearch] = useState(''), [year, setYear] = useState(''), [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(() => { setLoading(true); setError(''); void bscCyclesApi.list({ search, year: year ? Number(year) : undefined, cycleType: 'MONTH', status, page, limit: 20 })
    .then(result => { setItems(result.items); setTotal(result.total); }).catch(e => setError(e instanceof Error ? e.message : 'Không thể tải kỳ BSC.')).finally(() => setLoading(false)); }, [search, year, status, page]);
  useEffect(load, [load]);
  if (!canAdmin(permissions)) return <Navigate to="/" replace />;
  return <main className="grid gap-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Kỳ BSC</h1><p className="text-muted-foreground">Quản lý kỳ BSC theo tháng và hạn nộp kết quả đánh giá.</p></div>{canManage(permissions) && <Button asChild><Link to="/management/bsc-cycles/new">Tạo kỳ</Link></Button>}</div>
    <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-3"><Input aria-label="Tìm kỳ" placeholder="Tìm theo mã hoặc tên" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><Input aria-label="Năm" type="number" placeholder="Năm" value={year} onChange={e => { setYear(e.target.value); setPage(1); }} /><select aria-label="Trạng thái" className="h-9 rounded-lg border bg-background px-3" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></CardContent></Card>
    {loading ? <p role="status">Đang tải kỳ BSC…</p> : error ? <ErrorNotice error={error} retry={load} /> : items.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Chưa có kỳ BSC phù hợp.</CardContent></Card> : <Card><CardContent className="overflow-x-auto pt-6"><Table><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Thời gian</TableHead><TableHead>Hạn nộp kết quả đánh giá</TableHead><TableHead>Trạng thái</TableHead><TableHead>BSC</TableHead></TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}><TableCell><Link className="font-medium underline-offset-4 hover:underline" to={`/management/bsc-cycles/${item.id}`}>{item.code} — {item.name}</Link></TableCell><TableCell>{formatDate(item.startDate)} – {formatDate(item.endDate)}</TableCell><TableCell>{formatTime(item.evaluationSubmissionDeadline)}</TableCell><TableCell><Badge variant="outline">{statusLabel[item.status]}</Badge></TableCell><TableCell>{item.summary?.totalBsc ?? 0}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    <div className="flex items-center justify-end gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Trước</Button><span className="text-sm">Trang {page}</span><Button variant="outline" disabled={page * 20 >= total} onClick={() => setPage(value => value + 1)}>Sau</Button></div></main>;
};

type FormState = Omit<CyclePayload, 'year' | 'month'> & { year: string; month: string };
const emptyForm = (): FormState => ({ code: '', name: '', cycleType: 'MONTH', year: String(new Date().getFullYear()), month: '', startDate: '', endDate: '', evaluationSubmissionDeadline: '' });
const formFromCycle = (cycle: BscCycle): FormState => ({ code: cycle.code, name: cycle.name, cycleType: 'MONTH', year: String(cycle.year), month: cycle.month ? String(cycle.month) : '', startDate: cycle.startDate.slice(0, 10), endDate: cycle.endDate.slice(0, 10), evaluationSubmissionDeadline: toLocalInput(cycle.evaluationSubmissionDeadline) });
const payloadFromForm = (form: FormState): CyclePayload => ({ code: form.code.trim().toUpperCase(), name: form.name.trim(), cycleType: 'MONTH', year: Number(form.year), month: Number(form.month), startDate: form.startDate, endDate: form.endDate, evaluationSubmissionDeadline: vnInputToIso(form.evaluationSubmissionDeadline) });

export const BscCycleFormPage: React.FC = () => {
  const { id } = useParams(), navigate = useNavigate(), { user } = useAuth(), permissions = user?.permissions ?? [];
  const [form, setForm] = useState<FormState>(emptyForm), [version, setVersion] = useState<number | null>(null), [loading, setLoading] = useState(Boolean(id)), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (!id) return; void bscCyclesApi.detail(id).then(cycle => { setForm(formFromCycle(cycle)); setVersion(cycle.version); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  if (!canManage(permissions)) return <Navigate to="/" replace />;
  const set = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setError('');
    const ordered = [new Date(`${form.startDate}T00:00:00+07:00`), new Date(`${form.evaluationSubmissionDeadline}:00+07:00`), new Date(`${form.endDate}T23:59:59+07:00`)];
    const required = [form.code, form.name, form.year, form.month, form.startDate, form.endDate, form.evaluationSubmissionDeadline];
    if (required.some(value => value === '') || ordered.some((value, index) => Number.isNaN(value.getTime()) || (index > 0 && value < ordered[index - 1]))) return setError('Vui lòng nhập đủ dữ liệu và sắp xếp timeline theo đúng thứ tự.');
    setSaving(true); try { const saved = id && version ? await bscCyclesApi.update(id, { ...payloadFromForm(form), expectedVersion: version }) : await bscCyclesApi.create(payloadFromForm(form)); navigate(`/management/bsc-cycles/${saved.id}`); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu kỳ BSC.'); } finally { setSaving(false); } };
  if (loading) return <p role="status">Đang tải…</p>;
  return <main className="grid gap-6"><div><h1 className="text-3xl font-semibold">{id ? 'Chỉnh sửa kỳ BSC' : 'Tạo kỳ BSC'}</h1><p className="text-muted-foreground">Mọi mốc giờ được nhập theo múi giờ Việt Nam (UTC+7).</p></div>{error && <ErrorNotice error={error} />}
    <form onSubmit={submit} className="grid gap-6"><Card><CardHeader><CardTitle>Thông tin kỳ tháng</CardTitle><CardDescription>Tháng và khoảng thời gian không thể đổi sau khi kỳ mở hoặc đã có BSC.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Mã kỳ"><Input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} required /></Field><Field label="Tên kỳ"><Input value={form.name} onChange={e => set('name', e.target.value)} required /></Field><Field label="Năm"><Input type="number" value={form.year} onChange={e => set('year', e.target.value)} required /></Field><Field label="Tháng"><Input type="number" min="1" max="12" value={form.month} onChange={e => set('month', e.target.value)} required /></Field><Field label="Ngày bắt đầu"><Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} required /></Field><Field label="Ngày kết thúc"><Input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} required /></Field></CardContent></Card>
      <Card><CardHeader><CardTitle>Hạn đánh giá</CardTitle><CardDescription>Deadline này chỉ áp dụng khi nhân viên nộp kết quả EVALUATION.</CardDescription></CardHeader><CardContent><Field label="Hạn nộp kết quả đánh giá"><Input type="datetime-local" value={form.evaluationSubmissionDeadline} onChange={e => set('evaluationSubmissionDeadline', e.target.value)} required /></Field></CardContent></Card><div className="flex gap-3"><Button disabled={saving} type="submit">{saving ? 'Đang lưu…' : 'Lưu kỳ'}</Button><Button variant="outline" type="button" onClick={() => navigate(-1)}>Hủy</Button></div></form></main>;
};

const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => <Label className="grid gap-2">{label}{children}</Label>;

export const BscCycleDetailPage: React.FC = () => {
  const { id = '' } = useParams(), { user } = useAuth(), permissions = user?.permissions ?? [], navigate = useNavigate();
  const [cycle, setCycle] = useState<BscCycle | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [acting, setActing] = useState(false);
  const load = useCallback(() => { setLoading(true); setError(''); void bscCyclesApi.detail(id).then(setCycle).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]); useEffect(load, [load]);
  const actions = useMemo(() => cycle ? cycle.status === 'DRAFT' ? ['open'] as const : cycle.status === 'OPEN' ? ['lock'] as const : cycle.status === 'LOCKED' ? ['open'] as const : [] : [], [cycle]);
  if (!canAdmin(permissions)) return <Navigate to="/" replace />;
  const transition = async (action: 'open'|'lock', reason?: string) => { if (!cycle || acting) return; setActing(true); setError(''); try { setCycle(await bscCyclesApi.transition(cycle.id, action, cycle.version, reason)); } catch (e) { setError(e instanceof ApiError && e.status === 409 ? 'Kỳ đã thay đổi ở nơi khác. Dữ liệu đang được tải lại.' : e instanceof Error ? e.message : 'Không thể đổi trạng thái.'); await load(); } finally { setActing(false); } };
  if (loading) return <p role="status">Đang tải…</p>; if (error && !cycle) return <ErrorNotice error={error} retry={load} />; if (!cycle) return null;
  return <main className="grid gap-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">{cycle.code} — {cycle.name}</h1><Badge className="mt-2" variant="outline">{statusLabel[cycle.status]}</Badge></div><div className="flex flex-wrap gap-2">{canManage(permissions) && ['DRAFT','OPEN'].includes(cycle.status) && <Button variant="outline" onClick={() => navigate(`/management/bsc-cycles/${cycle.id}/edit`)}>Chỉnh sửa</Button>}{canManage(permissions) && actions.map(action => <ConfirmAction key={action} action={action} disabled={acting} requireReason={cycle.status === 'LOCKED' && action === 'open'} onConfirm={reason => void transition(action, reason)} />)}</div></div>{error && <ErrorNotice error={error} />}
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Thông tin kỳ</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm"><p>Loại: Tháng</p><p>Thời gian: {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}</p><p>Người tạo: {cycle.createdBy?.fullName ?? '—'}</p><p>Cập nhật: {formatTime(cycle.updatedAt)}</p></CardContent></Card><Card><CardHeader><CardTitle>Hạn đánh giá</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm"><p>Hạn nộp kết quả đánh giá: {formatTime(cycle.evaluationSubmissionDeadline)}</p></CardContent></Card></div>
    {cycle.summary && <Card><CardHeader><CardTitle>Tổng hợp BSC</CardTitle><CardDescription>Tính từ trạng thái PLAN và EVALUATION độc lập.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries({ 'Tổng BSC': cycle.summary.totalBsc, 'Chưa tạo': cycle.summary.notCreated, 'Nháp': cycle.summary.draft, 'Chờ duyệt PLAN': cycle.summary.planSubmitted, 'PLAN đã duyệt': cycle.summary.planApproved, 'Đang đánh giá': cycle.summary.evaluating, 'Chờ duyệt EVALUATION': cycle.summary.evaluationSubmitted, 'EVALUATION đã duyệt': cycle.summary.evaluationApproved, 'PLAN bị trả lại': cycle.summary.planReturned, 'EVALUATION bị trả lại': cycle.summary.evaluationReturned }).map(([label, value]) => <div key={label} className="rounded-lg border p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div>)}</CardContent></Card>}</main>;
};

function ConfirmAction({ action, disabled, requireReason = false, onConfirm }: { action: 'open'|'lock'; disabled: boolean; requireReason?: boolean; onConfirm: (reason?: string) => void }) {
  const [reason, setReason] = useState('');
  const config = { open: ['Mở kỳ BSC', 'Kỳ mở cho phép chủ sở hữu tiếp tục workflow theo trạng thái từng stage.'], lock: ['Khóa kỳ BSC', 'Khóa kỳ sẽ chặn chủ sở hữu tạo, sửa, nộp và duplicate vào kỳ này.'] }[action];
  return <AlertDialog><AlertDialogTrigger asChild><Button disabled={disabled} variant="outline">{config[0]}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{config[0]}?</AlertDialogTitle><AlertDialogDescription>{config[1]}</AlertDialogDescription></AlertDialogHeader>{requireReason && <Field label="Lý do mở lại"><Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required /></Field>}<AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction disabled={requireReason && !reason.trim()} onClick={() => onConfirm(reason.trim() || undefined)}>Xác nhận</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
