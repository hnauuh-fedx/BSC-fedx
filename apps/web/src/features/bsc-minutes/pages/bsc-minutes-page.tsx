import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileDownIcon, FolderOpenIcon, LoaderCircleIcon, PlusIcon, PrinterIcon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Textarea } from '../../../components/ui/textarea';
import { PermissionGate } from '../../auth/components/permission-gate';
import { useAuth } from '../../auth/hooks/use-auth';
import { departmentBscApi, DEPARTMENT_BSC_PERMISSIONS } from '../../department-bsc/department-bsc.service';
import type { DepartmentBsc } from '../../department-bsc/department-bsc.types';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../organization/management-ui';
import { reportsApi } from '../../reports/reports-api';
import { ReportOptions, ReportRow } from '../../reports/reports.types';
import { exportMinutesToPdf } from '../bsc-minutes-pdf';
import { bscMinutesApi } from '../bsc-minutes-api';
import type { BscMinutes, BscMinutesSummary, SaveBscMinutesInput } from '../bsc-minutes.types';
import { BscMinutesPrintDocument, type MinutesPrintCollectiveRow } from '../components/bsc-minutes-print-document';
import { SavedMinutesDialog } from '../components/saved-minutes-dialog';

const MINUTES_CREATE_PERMISSION = 'bsc.minutes.create';
const MINUTES_VIEW_PERMISSION = 'bsc.minutes.view';
const DEFAULT_MEETING_LOCATION = 'B11.204';
const DEFAULT_CHAIR_NAME = 'Hồ Minh Hải';
const DEFAULT_SECRETARY_NAME = 'Huỳnh Phương Linh';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

type MeetingForm = {
  number: string;
  issuePlace: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  chairName: string;
  secretaryName: string;
  absentCount: string;
  subject: string;
  meetingContent: string;
  nextMonthAssignment: string;
  conclusion: string;
};

type MinutesRow = Pick<ReportRow, 'id' | 'employeeName' | 'officialScore' | 'officialGrade'> & {
  unitScore: string;
  unitGrade: string;
  explanation: string;
};

const initialForm = (): MeetingForm => ({
  number: '', issuePlace: 'Vĩnh Long', date: today(), startTime: '08:00', endTime: '10:00',
  location: DEFAULT_MEETING_LOCATION, chairName: DEFAULT_CHAIR_NAME, secretaryName: DEFAULT_SECRETARY_NAME,
  absentCount: '0', subject: '', meetingContent: '',
  nextMonthAssignment: 'Kèm theo bảng BSC của cá nhân và đơn vị.', conclusion: '',
});

const cycleDefaults = (cycle?: ReportOptions['cycles'][number]) => {
  if (!cycle) return { subject: '', meetingContent: '' };
  const period = cycle.month ? `tháng ${cycle.month}/${cycle.year}` : cycle.name;
  const nextDate = new Date(Date.UTC(cycle.year, cycle.month ?? 1, 1));
  const nextPeriod = `tháng ${nextDate.getUTCMonth() + 1}/${nextDate.getUTCFullYear()}`;
  return {
    subject: `V/v đánh giá xếp loại viên chức, người lao động ${period}`,
    meetingContent: `Họp xét đánh giá xếp loại viên chức, người lao động ${period} và giao chỉ tiêu ${nextPeriod}.`,
  };
};

const toMinutesRows = (items: ReportRow[]): MinutesRow[] => items.map((item) => ({
  ...item,
  unitScore: item.officialScore ?? '',
  unitGrade: item.officialGrade ?? '',
  explanation: '',
}));

const firstNonEmpty = (...values: Array<string | null>) => values.find((value) => value?.trim())?.trim() ?? '';

async function loadAllPages<T>(loadPage: (page: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
  const first = await loadPage(1);
  const pageCount = Math.ceil(first.total / 100);
  if (pageCount <= 1) return first.items;
  const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => loadPage(index + 2)));
  return [first, ...remaining].flatMap((page) => page.items);
}

const toCollectiveRows = (items: DepartmentBsc[]): MinutesPrintCollectiveRow[] => items.map((item) => ({
  id: item.id,
  departmentName: item.departments.name,
  selfScore: String(item.total_score),
  selfGrade: item.final_grade ?? '',
  unitScore: item.final_score === null ? '' : String(item.final_score),
  unitGrade: item.final_grade ?? '',
  explanation: firstNonEmpty(item.director_comment, item.manager_comment),
}));

export const BscMinutesPage: React.FC = () => {
  const { user } = useAuth();
  const canCreateMinutes = user?.roles.some((role) => role.scopeType === 'GLOBAL' && role.permissions?.includes(MINUTES_CREATE_PERMISSION)) ?? false;
  const canViewDepartmentBsc = user?.permissions.includes(DEPARTMENT_BSC_PERMISSIONS.VIEW) ?? false;
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [cycleId, setCycleId] = useState('');
  const [form, setForm] = useState<MeetingForm>(initialForm);
  const [rows, setRows] = useState<MinutesRow[]>([]);
  const [collectiveRows, setCollectiveRows] = useState<MinutesPrintCollectiveRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [minutesDataReady, setMinutesDataReady] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(true);
  const [activeMinutes, setActiveMinutes] = useState<BscMinutes | null>(null);
  const [savedMinutes, setSavedMinutes] = useState<BscMinutesSummary[]>([]);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [loadingSavedMinutes, setLoadingSavedMinutes] = useState(false);
  const [error, setError] = useState('');
  const loadGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);
    if (!canCreateMinutes) {
      bscMinutesApi.list({ limit: 100 }).then((result) => {
        if (!active) return;
        setSavedMinutes(result.items);
        setSavedDialogOpen(true);
      }).catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải biên bản đã lưu.');
      }).finally(() => { if (active) setLoadingOptions(false); });
      return () => { active = false; };
    }
    reportsApi.options().then((result) => {
      if (!active) return;
      const selectedCycle = result.cycles.find((cycle) => cycle.status === 'OPEN') ?? result.cycles[0];
      setOptions(result);
      setCycleId(selectedCycle?.id ?? '');
      setForm((current) => ({
        ...current,
        ...cycleDefaults(selectedCycle),
      }));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu tạo biên bản.');
    }).finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [canCreateMinutes]);

  const loadRows = useCallback(async () => {
    if (activeMinutes?.cycle_id === cycleId) {
      setMinutesDataReady(true);
      setLoadingRows(false);
      return;
    }
    const generation = ++loadGeneration.current;
    if (!cycleId) { setRows([]); setCollectiveRows([]); setMinutesDataReady(false); return; }
    setLoadingRows(true);
    setMinutesDataReady(false);
    setError('');
    try {
      const individualRequest = loadAllPages((page) => reportsApi.list({
          cycleId,
          evaluationStatus: 'APPROVED',
          page,
          limit: 100,
          sortBy: 'final_score',
          sortOrder: 'desc',
        }));
      const collectiveRequest = canViewDepartmentBsc
        ? loadAllPages((page) => departmentBscApi.list({ cycleId, evaluationStatus: 'APPROVED', page, limit: 100 }))
        : Promise.resolve([]);
      const [individualResult, collectiveResult] = await Promise.allSettled([individualRequest, collectiveRequest]);
      if (generation !== loadGeneration.current) return;
      setRows(individualResult.status === 'fulfilled' ? toMinutesRows(individualResult.value) : []);
      setCollectiveRows(collectiveResult.status === 'fulfilled' ? toCollectiveRows(collectiveResult.value) : []);
      setMinutesDataReady(canViewDepartmentBsc && individualResult.status === 'fulfilled' && collectiveResult.status === 'fulfilled');
      const failure = individualResult.status === 'rejected' ? individualResult.reason
        : collectiveResult.status === 'rejected' ? collectiveResult.reason : null;
      if (failure) setError(failure instanceof Error ? failure.message : 'Không thể tải đầy đủ kết quả BSC đã duyệt.');
    } finally {
      if (generation === loadGeneration.current) setLoadingRows(false);
    }
  }, [activeMinutes, canViewDepartmentBsc, cycleId]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const selectedCycle = options?.cycles.find((cycle) => cycle.id === cycleId);
  const updateForm = (field: keyof MeetingForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!canCreateMinutes) return;
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setDirty(true);
  };
  const updateRow = (id: string, values: Partial<Pick<MinutesRow, 'unitScore' | 'unitGrade' | 'explanation'>>) => {
    if (!canCreateMinutes) return;
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...values } : row));
    setDirty(true);
  };
  const changeCycle = (value: string) => {
    if (!canCreateMinutes) return;
    const cycle = options?.cycles.find((item) => item.id === value);
    loadGeneration.current += 1;
    setMinutesDataReady(false);
    setActiveMinutes(null);
    setDirty(true);
    setCycleId(value);
    setForm((current) => ({ ...current, ...cycleDefaults(cycle) }));
  };
  const reset = () => {
    setActiveMinutes(null);
    setDirty(true);
    setForm({ ...initialForm(), ...cycleDefaults(selectedCycle) });
    setRows((current) => current.map((row) => ({ ...row, unitScore: row.officialScore ?? '', unitGrade: row.officialGrade ?? '', explanation: '' })));
  };

  const snapshotRows = () => rows.map((row) => ({
    id: row.id,
    employeeName: row.employeeName,
    selfScore: row.officialScore,
    selfGrade: row.officialGrade,
    unitScore: row.unitScore,
    unitGrade: row.unitGrade,
    explanation: row.explanation,
  }));

  const saveInput = (): SaveBscMinutesInput => ({
    cycleId,
    number: form.number,
    issuePlace: form.issuePlace,
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    location: form.location,
    chairName: form.chairName,
    secretaryName: form.secretaryName,
    absentCount: Math.max(0, Number(form.absentCount) || 0),
    subject: form.subject,
    meetingContent: form.meetingContent,
    nextMonthAssignment: form.nextMonthAssignment,
    conclusion: form.conclusion,
    snapshot: { rows: snapshotRows(), collectiveRows },
    expectedVersion: activeMinutes?.version,
  });

  const persistMinutes = async () => {
    if (!minutesDataReady || !cycleId) throw new Error('Dữ liệu biên bản chưa sẵn sàng để lưu.');
    setSaving(true);
    try {
      const minutes = activeMinutes
        ? await bscMinutesApi.update(activeMinutes.id, saveInput())
        : await bscMinutesApi.create(saveInput());
      setActiveMinutes(minutes);
      setDirty(false);
      return minutes;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setError('');
    try {
      await persistMinutes();
      toast.success('Đã lưu biên bản.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu biên bản.');
    }
  };

  const loadSavedMinutes = async () => {
    setSavedDialogOpen(true);
    setLoadingSavedMinutes(true);
    setError('');
    try {
      const result = await bscMinutesApi.list({ limit: 100 });
      setSavedMinutes(result.items);
    } catch (cause) {
      setSavedDialogOpen(false);
      setError(cause instanceof Error ? cause.message : 'Không thể tải biên bản đã lưu.');
    } finally {
      setLoadingSavedMinutes(false);
    }
  };

  const openSavedMinutes = async (summary: BscMinutesSummary) => {
    setLoadingSavedMinutes(true);
    setError('');
    try {
      const minutes = await bscMinutesApi.detail(summary.id);
    setActiveMinutes(minutes);
    setCycleId(minutes.cycle_id);
    setForm({
      number: minutes.minutes_number,
      issuePlace: minutes.issue_place,
      date: minutes.meeting_date.slice(0, 10),
      startTime: minutes.start_time,
      endTime: minutes.end_time,
      location: minutes.meeting_location,
      chairName: minutes.chair_name,
      secretaryName: minutes.secretary_name,
      absentCount: String(minutes.absent_count),
      subject: minutes.subject,
      meetingContent: minutes.meeting_content,
      nextMonthAssignment: minutes.next_month_assignment,
      conclusion: minutes.conclusion,
    });
    setRows(minutes.snapshot.rows.map((row) => ({
      id: row.id,
      employeeName: row.employeeName,
      officialScore: row.selfScore,
      officialGrade: row.selfGrade,
      unitScore: row.unitScore,
      unitGrade: row.unitGrade,
      explanation: row.explanation,
    })));
    setCollectiveRows(minutes.snapshot.collectiveRows);
    setMinutesDataReady(true);
    setDirty(false);
    setSavedDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể mở biên bản đã lưu.');
    } finally {
      setLoadingSavedMinutes(false);
    }
  };

  const printMinutes = async () => {
    setError('');
    try {
      const persisted = dirty || !activeMinutes ? await persistMinutes() : activeMinutes;
      const recorded = await bscMinutesApi.recordOutput(persisted.id, 'PRINT');
      setActiveMinutes(recorded);
      window.print();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuẩn bị biên bản để in.');
    }
  };
  const savePdf = async () => {
    if (!minutesDataReady) return;
    const documentElement = document.querySelector<HTMLElement>('.minutes-print-document');
    if (!documentElement) return;

    setExportingPdf(true);
    setError('');
    try {
      const cyclePart = selectedCycle?.code || selectedCycle?.name || 'BSC';
      const numberPart = form.number || 'nhap';
      const filename = `bien-ban-${cyclePart}-${numberPart}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, '-');
      const persisted = dirty || !activeMinutes ? await persistMinutes() : activeMinutes;
      await exportMinutesToPdf(documentElement, filename);
      const recorded = await bscMinutesApi.recordOutput(persisted.id, 'PDF');
      setActiveMinutes(recorded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu biên bản thành PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return <PermissionGate anyOf={[MINUTES_CREATE_PERMISSION, MINUTES_VIEW_PERMISSION]} fallback={<main><ErrorState error="Bạn không có quyền xem biên bản đánh giá BSC." /></main>}>
    <main className="bsc-minutes-page flex flex-col gap-5">
      <div className="minutes-editor flex flex-col gap-5">
      <PageHeader
        title="Biên bản họp đánh giá BSC"
        description="Mẫu biên bản được tự động điền từ toàn bộ BSC đã duyệt đánh giá trong kỳ của công ty."
        action={<div className="flex flex-wrap gap-2 print:hidden">
          <Button type="button" variant="outline" onClick={() => void loadSavedMinutes()}><FolderOpenIcon data-icon="inline-start" />Biên bản đã lưu</Button>
          {canCreateMinutes && <>
            <Button type="button" variant="outline" onClick={reset}><PlusIcon data-icon="inline-start" />Biên bản mới</Button>
            <Button type="button" variant="outline" onClick={reset}><RotateCcwIcon data-icon="inline-start" />Làm lại</Button>
            <Button type="button" variant="outline" disabled={saving || !minutesDataReady} onClick={() => void save()}>{saving ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SaveIcon data-icon="inline-start" />}{saving ? 'Đang lưu…' : 'Lưu biên bản'}</Button>
            <Button type="button" variant="outline" disabled={exportingPdf || !minutesDataReady} onClick={() => void savePdf()}>{exportingPdf ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <FileDownIcon data-icon="inline-start" />}{exportingPdf ? 'Đang tạo PDF…' : 'Lưu PDF'}</Button>
            <Button type="button" disabled={saving || !minutesDataReady} onClick={() => void printMinutes()}><PrinterIcon data-icon="inline-start" />In biên bản</Button>
          </>}
        </div>}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2"><p className="font-semibold uppercase text-primary">{selectedCycle ? `${activeMinutes ? 'Biên bản' : 'Tạo biên bản họp đánh giá BSC mới'} ${selectedCycle.name}` : 'Chọn kỳ BSC để tạo biên bản'}</p>{activeMinutes && <Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</Badge>}</div>
      </PageHeader>

      {error && <ErrorState error={error} onRetry={() => void loadRows()} />}
      {loadingOptions ? <LoadingState message="Đang chuẩn bị mẫu biên bản…" /> : <>
        <fieldset disabled={!canCreateMinutes} className="contents">
        <Card className="minutes-information-card">
          <CardHeader>
            <CardTitle>Thông tin biên bản</CardTitle>
            <CardDescription>Thông tin bắt buộc để nhận diện cuộc họp đánh giá.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend className="sr-only">Thông tin cuộc họp</FieldLegend>
              <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field><FieldLabel htmlFor="minutes-cycle">Kỳ BSC</FieldLabel><Select value={cycleId} onValueChange={changeCycle}><SelectTrigger id="minutes-cycle" className="w-full"><SelectValue placeholder="Chọn kỳ BSC" /></SelectTrigger><SelectContent><SelectGroup>{options?.cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel htmlFor="minutes-number">Số biên bản</FieldLabel><Input id="minutes-number" type="number" min="1" step="1" inputMode="numeric" value={form.number} onChange={updateForm('number')} placeholder="Ví dụ: 63" /></Field>
                <Field><FieldLabel htmlFor="minutes-issue-place">Địa điểm lập biên bản</FieldLabel><Input id="minutes-issue-place" value={form.issuePlace} onChange={updateForm('issuePlace')} /></Field>
                <Field><FieldLabel htmlFor="minutes-date">Ngày họp</FieldLabel><Input id="minutes-date" type="date" value={form.date} onChange={updateForm('date')} /></Field>
                <Field><FieldLabel htmlFor="minutes-start">Giờ bắt đầu</FieldLabel><Input id="minutes-start" type="time" value={form.startTime} onChange={updateForm('startTime')} /></Field>
                <Field><FieldLabel htmlFor="minutes-end">Giờ kết thúc</FieldLabel><Input id="minutes-end" type="time" value={form.endTime} onChange={updateForm('endTime')} /></Field>
                <Field className="lg:col-span-2"><FieldLabel htmlFor="minutes-location">Nơi họp</FieldLabel><Input id="minutes-location" value={form.location} onChange={updateForm('location')} placeholder="Nhập địa điểm họp" /></Field>
                <Field><FieldLabel htmlFor="minutes-chair">Chủ trì</FieldLabel><Input id="minutes-chair" value={form.chairName} onChange={updateForm('chairName')} /></Field>
                <Field><FieldLabel htmlFor="minutes-secretary">Thư ký</FieldLabel><Input id="minutes-secretary" value={form.secretaryName} onChange={updateForm('secretaryName')} placeholder="Nhập tên thư ký" /></Field>
                <Field><FieldLabel htmlFor="minutes-absent-count">Số lượng vắng</FieldLabel><Input id="minutes-absent-count" type="number" min="0" value={form.absentCount} onChange={updateForm('absentCount')} /></Field>
                <Field className="lg:col-span-3"><FieldLabel htmlFor="minutes-subject">Trích yếu biên bản</FieldLabel><Input id="minutes-subject" value={form.subject} onChange={updateForm('subject')} /></Field>
                <Field className="lg:col-span-3"><FieldLabel htmlFor="minutes-content">Nội dung cuộc họp</FieldLabel><Textarea id="minutes-content" rows={3} value={form.meetingContent} onChange={updateForm('meetingContent')} /></Field>
              </FieldGroup>
            </FieldSet>
          </CardContent>
        </Card>

        <Card className="minutes-results-card">
          <CardHeader>
            <CardTitle>Kết quả đánh giá</CardTitle>
            <CardDescription>Toàn công ty · {rows.length} BSC cá nhân và {collectiveRows.length} BSC phòng ban đã duyệt đánh giá</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRows ? <LoadingState message="Đang tải kết quả BSC…" /> : rows.length === 0 && collectiveRows.length === 0 ? <EmptyState message="Chưa có BSC đã duyệt đánh giá trong kỳ này." /> : <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[1100px] border-collapse [&_td]:border-r [&_th]:border-r [&_tr>*:last-child]:border-r-0">
                <TableHeader><TableRow><TableHead>Họ và tên</TableHead><TableHead>Điểm tự đánh giá</TableHead><TableHead>Xếp loại tự đánh giá</TableHead><TableHead>Điểm đơn vị đánh giá</TableHead><TableHead>Xếp loại đơn vị đánh giá</TableHead><TableHead className="min-w-64">Thuyết minh</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((row) => <TableRow key={row.id}>
                  <TableCell>{row.employeeName}</TableCell>
                  <TableCell>{row.officialScore ?? '—'}</TableCell>
                  <TableCell>{row.officialGrade ?? '—'}</TableCell>
                  <TableCell><Input type="number" step="0.01" min="0" aria-label={`Điểm đơn vị đánh giá ${row.employeeName}`} value={row.unitScore} onChange={(event) => updateRow(row.id, { unitScore: event.target.value })} /></TableCell>
                  <TableCell><Select value={row.unitGrade} onValueChange={(value) => updateRow(row.id, { unitGrade: value })}><SelectTrigger className="w-full" aria-label={`Xếp loại đơn vị đánh giá ${row.employeeName}`}><SelectValue placeholder="Chọn loại" /></SelectTrigger><SelectContent><SelectGroup>{(options?.grades ?? []).filter((grade) => grade.assignable).map((grade) => <SelectItem key={grade.value} value={grade.value}>{grade.label}</SelectItem>)}</SelectGroup></SelectContent></Select></TableCell>
                  <TableCell><Textarea rows={2} aria-label={`Thuyết minh ${row.employeeName}`} value={row.explanation} onChange={(event) => updateRow(row.id, { explanation: event.target.value })} placeholder="Nhập thuyết minh" /></TableCell>
                </TableRow>)}</TableBody>
                <TableFooter>{collectiveRows.length > 0 ? collectiveRows.map((row) => <TableRow key={row.id}>
                  <TableHead scope="row">{`Tập thể · ${row.departmentName}`}</TableHead>
                  <TableCell>{row.selfScore || '—'}</TableCell>
                  <TableCell>{row.selfGrade || '—'}</TableCell>
                  <TableCell>{row.unitScore || '—'}</TableCell>
                  <TableCell>{row.unitGrade || '—'}</TableCell>
                  <TableCell>{row.explanation || '—'}</TableCell>
                </TableRow>) : <TableRow><TableHead scope="row">Tập thể</TableHead><TableCell colSpan={5}>{canViewDepartmentBsc ? 'Chưa có BSC phòng ban đã duyệt đánh giá.' : 'Bạn không có quyền xem dữ liệu BSC phòng ban.'}</TableCell></TableRow>}</TableFooter>
              </Table>
            </div>}
          </CardContent>
        </Card>

        <Card className="minutes-conclusion-card">
          <CardHeader><CardTitle>Giao chỉ tiêu và kết luận</CardTitle><CardDescription>Nội dung này được đưa nguyên văn vào mục III.2 và IV của bản in.</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="minutes-next-assignment">Giao chỉ tiêu tháng tới</FieldLabel><Textarea id="minutes-next-assignment" rows={3} value={form.nextMonthAssignment} onChange={updateForm('nextMonthAssignment')} /></Field>
            <Field><FieldLabel htmlFor="minutes-conclusion">Kết luận</FieldLabel><Textarea id="minutes-conclusion" rows={6} value={form.conclusion} onChange={updateForm('conclusion')} placeholder="Nhập kết luận cuộc họp" /></Field>
          </FieldGroup></CardContent>
        </Card>
        </fieldset>
      </>}
      </div>
      {!loadingOptions && minutesDataReady && <BscMinutesPrintDocument
        number={form.number} issuePlace={form.issuePlace} date={form.date}
        startTime={form.startTime} endTime={form.endTime} location={form.location} chairName={form.chairName}
        secretaryName={form.secretaryName} absentCount={form.absentCount} subject={form.subject}
        meetingContent={form.meetingContent} nextMonthAssignment={form.nextMonthAssignment} conclusion={form.conclusion}
        collectiveRows={collectiveRows}
        rows={rows.map((row) => ({ id: row.id, employeeName: row.employeeName, selfScore: row.officialScore, selfGrade: row.officialGrade, unitScore: row.unitScore, unitGrade: row.unitGrade, explanation: row.explanation }))}
      />}
      <SavedMinutesDialog open={savedDialogOpen} loading={loadingSavedMinutes} items={savedMinutes} onOpenChange={setSavedDialogOpen} onSelect={openSavedMinutes}/>
    </main>
  </PermissionGate>;
};
