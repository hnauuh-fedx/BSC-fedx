import React, { useEffect, useState } from 'react';
import { CopyIcon, EyeIcon, FileSpreadsheetIcon, PlusIcon, PrinterIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscDuplicateOptions, EmployeeBsc } from '../types/employee-bsc.types';
import { downloadBrowserFile } from '../utils/download-browser-file';

const REVIEW_PERMISSIONS = [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE];
const planStatuses = [{ value: 'DRAFT', label: 'Nháp' }, { value: 'SUBMITTED', label: 'Chờ duyệt' }, { value: 'RETURNED', label: 'Bị trả lại' }, { value: 'APPROVED', label: 'Đã duyệt' }];
const evaluationStatuses = [{ value: 'NOT_STARTED', label: 'Chưa bắt đầu' }, { value: 'DRAFT', label: 'Đang tự đánh giá' }, { value: 'SUBMITTED', label: 'Chờ duyệt đánh giá' }, { value: 'RETURNED', label: 'Bị trả lại' }, { value: 'APPROVED', label: 'Đã duyệt' }];

export const BscListPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useAuthContext();
  const globalDirectorPermissions = new Set(state.user?.roles
    .filter(role => role.code === 'DIRECTOR' && role.scopeType === 'GLOBAL')
    .flatMap(role => role.permissions ?? []) ?? []);
  const canReview = REVIEW_PERMISSIONS.some(permission => globalDirectorPermissions.has(permission));
  const canReviewReopen = globalDirectorPermissions.has(BSC_PERMISSIONS.REVIEW_REOPEN);
  const [items, setItems] = useState<EmployeeBsc[]>([]), [search, setSearch] = useState('');
  const [planStatus, setPlanStatus] = useState('ALL'), [evaluationStatus, setEvaluationStatus] = useState('ALL');
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [reload, setReload] = useState(0), [exportingId, setExportingId] = useState('');
  const [duplicateSource, setDuplicateSource] = useState<EmployeeBsc | null>(null), [duplicateOptions, setDuplicateOptions] = useState<BscDuplicateOptions | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false), [duplicateError, setDuplicateError] = useState('');
  const [targetCycleId, setTargetCycleId] = useState(''), [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    setLoading(true); setError(''); setItems([]);
    employeeBscApi.list({ scope: 'OWN', search, planStatus: planStatus === 'ALL' ? '' : planStatus, evaluationStatus: evaluationStatus === 'ALL' ? '' : evaluationStatus, page, limit: 20, sortBy: 'created_at', sortOrder: 'desc' })
      .then(result => { setItems(result.items); setTotal(result.total); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách BSC.'))
      .finally(() => setLoading(false));
  }, [search, planStatus, evaluationStatus, page, reload]);

  const exportExcel = async (item: EmployeeBsc) => { setExportingId(item.id); setError(''); try { downloadBrowserFile(await employeeBscApi.exportExcel(item.employee_id, item.cycle_id)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xuất Excel.'); } finally { setExportingId(''); } };
  const openDuplicate = async (item: EmployeeBsc) => { setDuplicateSource(item); setDuplicateLoading(true); setDuplicateError(''); setDuplicateOptions(null); try { const options = await employeeBscApi.duplicateOptions(item.id); setDuplicateOptions(options); setTargetCycleId(options.suggestedCycleId ?? ''); } catch (cause) { setDuplicateError(cause instanceof Error ? cause.message : 'Không thể tải kỳ đích để sao chép.'); } finally { setDuplicateLoading(false); } };
  const closeDuplicate = () => { if (duplicating) return; setDuplicateSource(null); setDuplicateOptions(null); setDuplicateError(''); setTargetCycleId(''); };
  const duplicate = async () => { if (!duplicateSource || !targetCycleId) return; setDuplicating(true); setDuplicateError(''); try { const created = await employeeBscApi.duplicate(duplicateSource.id, targetCycleId); setDuplicateSource(null); setDuplicateOptions(null); navigate(`/employee-bsc/${created.id}`); } catch (cause) { setDuplicateError(cause instanceof Error ? cause.message : 'Không thể sao chép BSC.'); } finally { setDuplicating(false); } };

  return <main>
    <PageHeader title="BSC cá nhân" description="Theo dõi độc lập trạng thái kế hoạch và đánh giá của từng kỳ." action={<>
      {canReview && <Button variant="outline" asChild><Link to="/management/bsc-reviews">BSC chờ duyệt</Link></Button>}
      {canReviewReopen && <Button variant="outline" asChild><Link to="/management/bsc-reopen-requests">Yêu cầu mở lại</Link></Button>}
      <PermissionGate permission={BSC_PERMISSIONS.CREATE_OWN}><Button asChild><Link to="/employee-bsc/new"><PlusIcon data-icon="inline-start"/>Tạo BSC cá nhân</Link></Button></PermissionGate>
    </>}/>
    <Card><CardHeader><CardTitle>Bộ lọc</CardTitle><CardDescription>Tìm và lọc BSC theo trạng thái của từng giai đoạn.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
      <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
      <Field><FieldLabel>Kế hoạch</FieldLabel><Select value={planStatus} onValueChange={value => { setPlanStatus(value); setPage(1); }}><SelectTrigger aria-label="Trạng thái kế hoạch"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ALL">Tất cả kế hoạch</SelectItem>{planStatuses.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel>Đánh giá</FieldLabel><Select value={evaluationStatus} onValueChange={value => { setEvaluationStatus(value); setPage(1); }}><SelectTrigger aria-label="Trạng thái đánh giá"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="ALL">Tất cả đánh giá</SelectItem>{evaluationStatuses.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    </CardContent></Card>
    {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>} 
    {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message="Chưa có BSC cá nhân." action={<PermissionGate permission={BSC_PERMISSIONS.CREATE_OWN}><Button asChild><Link to="/employee-bsc/new">Tạo BSC đầu tiên</Link></Button></PermissionGate>}/> : !error && <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Đơn vị</TableHead><TableHead>Kế hoạch</TableHead><TableHead>Đánh giá</TableHead><TableHead>Điểm</TableHead><TableHead>Xếp loại</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}><TableCell className="font-medium">{item.bsc_cycles.name}</TableCell><TableCell>{item.departments.name}</TableCell><TableCell><BscStatusBadge status={item.plan_status}/></TableCell><TableCell><BscStatusBadge status={item.evaluation_status}/></TableCell><TableCell>{item.evaluation_status === 'APPROVED' ? item.final_score ?? '—' : '—'}</TableCell><TableCell>{item.evaluation_status === 'APPROVED' ? item.final_grade ?? '—' : '—'}</TableCell><TableCell><div className="flex justify-end gap-1 whitespace-nowrap"><Button asChild variant="outline" size="icon-sm"><Link to={`/employee-bsc/${item.id}`} aria-label="Xem chi tiết" title="Xem chi tiết"><EyeIcon data-icon="inline-start"/></Link></Button><PermissionGate permission={BSC_PERMISSIONS.EXPORT}><Button variant="outline" size="icon-sm" aria-label="Xuất Excel" title="Xuất Excel" disabled={exportingId === item.id} onClick={() => void exportExcel(item)}>{exportingId === item.id ? <Spinner/> : <FileSpreadsheetIcon data-icon="inline-start"/>}</Button></PermissionGate><Button variant="outline" size="icon-sm" aria-label="In BSC" title="In BSC" onClick={() => window.open(`/employee-bsc/${item.id}?print=1`, '_blank', 'noopener,noreferrer')}><PrinterIcon data-icon="inline-start"/></Button><PermissionGate permission={BSC_PERMISSIONS.DUPLICATE_OWN}><Button variant="outline" size="icon-sm" aria-label="Sao chép BSC" title="Sao chép BSC" onClick={() => void openDuplicate(item)}><CopyIcon data-icon="inline-start"/></Button></PermissionGate></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    <Pagination page={page} total={total} limit={20} onChange={setPage}/>
    <AccessibleDialog open={Boolean(duplicateSource)} title="Sao chép BSC" description="BSC mới chỉ kế thừa cấu trúc kế hoạch; kết quả, điểm và lịch sử duyệt không được sao chép." onClose={closeDuplicate} busy={duplicating}>
      {duplicateLoading ? <LoadingState/> : <>{duplicateError && <ErrorState error={duplicateError}/>} {duplicateOptions && <><p>{duplicateOptions.sourceVersion ? `BSC nguồn có dữ liệu: phiên bản ${duplicateOptions.sourceVersion.versionNumber} · ${duplicateOptions.sourceVersion.summary.itemCount} KPI · tổng tỷ trọng ${String(duplicateOptions.sourceVersion.summary.totalWeight ?? '—')}%.` : 'BSC nguồn chưa có phiên bản 1; BSC mới sẽ để trống.'}</p>{duplicateOptions.cycles.length === 0 ? <p role="status">Chưa có kỳ tháng nào sau {duplicateSource?.bsc_cycles.name ?? 'kỳ nguồn'} đang mở và chưa có BSC của bạn. Hãy nhờ quản trị viên tạo hoặc mở kỳ tiếp theo rồi thử lại.</p> : <Field><FieldLabel>Kỳ đích</FieldLabel><Select value={targetCycleId} onValueChange={setTargetCycleId}><SelectTrigger aria-label="Kỳ đích"><SelectValue placeholder="Chọn kỳ đích"/></SelectTrigger><SelectContent><SelectGroup>{duplicateOptions.cycles.map(cycle => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}<div className="dialog-actions">{duplicateOptions.cycles.length > 0 && <Button disabled={!targetCycleId || duplicating} onClick={() => void duplicate()}>{duplicating && <Spinner data-icon="inline-start"/>}{duplicating ? 'Đang sao chép…' : 'Xác nhận sao chép'}</Button>}<Button variant="outline" onClick={closeDuplicate}>Hủy</Button></div></>}</>}
    </AccessibleDialog>
  </main>;
};
