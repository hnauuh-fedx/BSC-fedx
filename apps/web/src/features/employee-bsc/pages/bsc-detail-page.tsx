import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { SystemConfirmOptions, useSystemConfirm } from '../../../components/system-confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Spinner } from '../../../components/ui/spinner';
import { Textarea } from '../../../components/ui/textarea';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, FormField, LoadingState, PageHeader } from '../../organization/management-ui';
import { BscItemTable } from '../components/bsc-item-table';
import { BscScoreSummary } from '../components/bsc-score-summary';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscDuplicateOptions, BscReopenRequest, BscScoringPreview, BscVersionDetail, BscVersionSummary, EmployeeBsc } from '../types/employee-bsc.types';
import { downloadBrowserFile } from '../utils/download-browser-file';

type WorkflowAction = 'submitPlan' | 'approvePlan' | 'returnPlan' | 'submitEvaluation' | 'approveEvaluation' | 'returnEvaluation';
type Stage = 'PLAN' | 'EVALUATION';
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const stageLabel = (stage: string) => stage === 'PLAN' ? 'Kế hoạch' : stage === 'EVALUATION' ? 'Kết quả đánh giá' : 'Toàn bộ BSC';
const versionTypeLabel = (type: string) => ({ PLAN_APPROVED: 'Kế hoạch đã duyệt', EVALUATION_APPROVED: 'Kết quả đã duyệt', PRE_REOPEN: 'Trước khi mở lại' }[type] ?? 'Phiên bản BSC');

const workflowConfirmations: Record<Exclude<WorkflowAction, 'returnPlan' | 'returnEvaluation'>, SystemConfirmOptions> = {
  submitPlan: {
    title: 'Gửi duyệt BSC?',
    description: 'Sau khi gửi, định nghĩa KPI sẽ bị khóa cho đến khi BSC được duyệt hoặc trả lại.',
    confirmLabel: 'Gửi duyệt',
  },
  approvePlan: {
    title: 'Duyệt nội dung BSC?',
    description: 'Định nghĩa KPI sẽ được khóa và chủ sở hữu có thể bắt đầu nhập kết quả thực hiện.',
    confirmLabel: 'Duyệt BSC',
  },
  submitEvaluation: {
    title: 'Gửi duyệt kết quả?',
    description: 'Kết quả và thuyết minh sẽ bị khóa trong thời gian chờ cấp trên xét duyệt.',
    confirmLabel: 'Gửi duyệt',
  },
  approveEvaluation: {
    title: 'Duyệt kết quả đánh giá?',
    description: 'Điểm và xếp loại hiện tại sẽ trở thành chính thức, đồng thời toàn bộ BSC được khóa.',
    confirmLabel: 'Duyệt kết quả',
  },
};

export const BscDetailPage: React.FC = () => {
  const { id = '' } = useParams(), navigate = useNavigate(), [searchParams] = useSearchParams(), { state } = useAuthContext();
  const confirm = useSystemConfirm();
  const printRequested = searchParams.get('print') === '1', hasPrinted = useRef(false);
  const permissions = state.user?.permissions ?? [];
  const [bsc, setBsc] = useState<EmployeeBsc | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [scoring, setScoring] = useState<BscScoringPreview | null>(null), [scoringLoading, setScoringLoading] = useState(true), [scoringError, setScoringError] = useState('');
  const [versions, setVersions] = useState<BscVersionSummary[]>([]), [versionsLoading, setVersionsLoading] = useState(false), [versionsError, setVersionsError] = useState('');
  const [reopenRequests, setReopenRequests] = useState<BscReopenRequest[]>([]), [reopenError, setReopenError] = useState('');
  const [action, setAction] = useState<WorkflowAction | null>(null), [actionError, setActionError] = useState('');
  const [returnStage, setReturnStage] = useState<Stage | null>(null), [returnReason, setReturnReason] = useState('');
  const [reopenStage, setReopenStage] = useState<Stage | null>(null), [reopenReason, setReopenReason] = useState('');
  const [reopenActionId, setReopenActionId] = useState(''), [rejectingReopen, setRejectingReopen] = useState<BscReopenRequest | null>(null);
  const [reopenRejectReason, setReopenRejectReason] = useState('');
  const [duplicateOptions, setDuplicateOptions] = useState<BscDuplicateOptions | null>(null), [targetCycleId, setTargetCycleId] = useState('');
  const [duplicateLoading, setDuplicateLoading] = useState(false), [duplicateError, setDuplicateError] = useState('');
  const [versionDetail, setVersionDetail] = useState<BscVersionDetail | null>(null), [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const mutationPending = useRef(false);

  const load = useCallback(async (initial = false) => {
    if (initial) { setLoading(true); setError(''); }
    try { setBsc(await employeeBscApi.detail(id)); }
    catch (cause) {
      if (!initial) throw cause;
      setBsc(null); setError(cause instanceof Error ? cause.message : 'Không thể tải BSC.');
    }
    finally { if (initial) setLoading(false); }
  }, [id]);
  const loadScoring = useCallback(async (initial = false) => {
    if (initial) { setScoringLoading(true); setScoring(null); }
    setScoringError('');
    try { setScoring(await employeeBscApi.scoringPreview(id)); }
    catch (cause) {
      if (!initial) throw cause;
      setScoringError(cause instanceof Error ? cause.message : 'Không thể tải điểm tạm tính.');
    }
    finally { if (initial) setScoringLoading(false); }
  }, [id]);
  const loadVersions = useCallback(async () => {
    if (!permissions.includes(BSC_PERMISSIONS.VIEW_VERSION)) { setVersions([]); return; }
    setVersionsLoading(true); setVersionsError('');
    try { setVersions(await employeeBscApi.versions(id)); }
    catch (cause) { setVersions([]); setVersionsError(cause instanceof Error ? cause.message : 'Không thể tải lịch sử phiên bản.'); }
    finally { setVersionsLoading(false); }
  }, [id, permissions]);
  const loadReopenRequests = useCallback(async () => {
    if (!permissions.some(value => value === BSC_PERMISSIONS.REQUEST_REOPEN || value === BSC_PERMISSIONS.REVIEW_REOPEN)) { setReopenRequests([]); return; }
    setReopenError('');
    try { setReopenRequests(await employeeBscApi.reopenRequests(id)); }
    catch (cause) { setReopenRequests([]); setReopenError(cause instanceof Error ? cause.message : 'Không thể tải yêu cầu mở lại.'); }
  }, [id, permissions]);
  const reloadAll = useCallback(async (initial = false) => { await Promise.all([load(initial), loadScoring(initial), loadVersions(), loadReopenRequests()]); }, [load, loadScoring, loadVersions, loadReopenRequests]);
  const refreshBscAndScoring = useCallback(async () => { await Promise.all([load(), loadScoring()]); }, [load, loadScoring]);
  useEffect(() => { void reloadAll(true); }, [reloadAll]);
  useEffect(() => {
    if (!printRequested || hasPrinted.current || loading || scoringLoading || !bsc) return;
    hasPrinted.current = true;
    const timer = window.setTimeout(() => window.print(), 0);
    return () => window.clearTimeout(timer);
  }, [bsc, loading, printRequested, scoringLoading]);

  const runAction = async (kind: WorkflowAction) => {
    if (mutationPending.current) return;
    if (kind.startsWith('return') && !returnReason.trim()) { setActionError('Vui lòng nhập lý do trả lại.'); return; }
    if (!kind.startsWith('return') && !await confirm(workflowConfirmations[kind as keyof typeof workflowConfirmations])) return;
    mutationPending.current = true; setAction(kind); setActionError('');
    try {
      if (kind === 'submitPlan') await employeeBscApi.submitPlan(id);
      else if (kind === 'approvePlan') await employeeBscApi.approvePlan(id);
      else if (kind === 'returnPlan') await employeeBscApi.returnPlan(id, returnReason);
      else if (kind === 'submitEvaluation') await employeeBscApi.submitEvaluation(id);
      else if (kind === 'approveEvaluation') await employeeBscApi.approveEvaluation(id);
      else await employeeBscApi.returnEvaluation(id, returnReason);
      setReturnStage(null); setReturnReason(''); await reloadAll();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xử lý BSC.'); }
    finally { mutationPending.current = false; setAction(null); }
  };

  const requestReopen = async () => {
    if (!reopenStage || !reopenReason.trim() || mutationPending.current) return;
    mutationPending.current = true; setActionError('');
    try { await employeeBscApi.requestReopen(id, reopenStage, reopenReason); setReopenStage(null); setReopenReason(''); await reloadAll(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể gửi yêu cầu mở lại.'); }
    finally { mutationPending.current = false; }
  };

  const approveReopen = async (request: BscReopenRequest) => {
    if (mutationPending.current) return;
    const accepted = await confirm({
      title: `Duyệt mở lại ${stageLabel(request.stage).toLowerCase()}?`,
      description: request.stage === 'PLAN'
        ? 'Định nghĩa KPI sẽ được mở lại và dữ liệu đánh giá hiện tại được lưu vào lịch sử trước khi đặt lại.'
        : 'Chỉ kết quả thực hiện và thuyết minh được mở lại; định nghĩa KPI vẫn khóa.',
      confirmLabel: 'Duyệt mở lại',
    });
    if (!accepted) return;
    mutationPending.current = true; setReopenActionId(request.id); setActionError('');
    try { await employeeBscApi.approveReopen(request.id); await reloadAll(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể duyệt yêu cầu mở lại.'); }
    finally { mutationPending.current = false; setReopenActionId(''); }
  };

  const rejectReopen = async () => {
    if (!rejectingReopen || !reopenRejectReason.trim() || mutationPending.current) return;
    mutationPending.current = true; setReopenActionId(rejectingReopen.id); setActionError('');
    try {
      await employeeBscApi.rejectReopen(rejectingReopen.id, reopenRejectReason);
      setRejectingReopen(null); setReopenRejectReason(''); await reloadAll();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể từ chối yêu cầu mở lại.'); }
    finally { mutationPending.current = false; setReopenActionId(''); }
  };

  const openDuplicate = async () => {
    setDuplicateLoading(true); setDuplicateError(''); setDuplicateOptions(null);
    try { const options = await employeeBscApi.duplicateOptions(id); setDuplicateOptions(options); setTargetCycleId(options.suggestedCycleId ?? ''); }
    catch (cause) { setDuplicateError(cause instanceof Error ? cause.message : 'Không thể tải kỳ đích.'); }
    finally { setDuplicateLoading(false); }
  };
  const duplicate = async () => {
    if (!targetCycleId || mutationPending.current) return;
    mutationPending.current = true; setDuplicateError('');
    try { const created = await employeeBscApi.duplicate(id, targetCycleId); navigate(`/employee-bsc/${created.id}`); }
    catch (cause) { setDuplicateError(cause instanceof Error ? cause.message : 'Không thể sao chép BSC.'); }
    finally { mutationPending.current = false; }
  };
  const showVersion = async (versionId: string) => {
    setVersionDetailLoading(true); setVersionsError('');
    try { setVersionDetail(await employeeBscApi.version(id, versionId)); }
    catch (cause) { setVersionsError(cause instanceof Error ? cause.message : 'Không thể tải phiên bản.'); }
    finally { setVersionDetailLoading(false); }
  };

  if (loading) return <main><LoadingState/></main>;
  if (error) return <main><ErrorState error={error} onRetry={() => void reloadAll(true)}/><Button variant="outline" asChild><Link to="/employee-bsc">Quay lại</Link></Button></main>;
  if (!bsc) return <main><EmptyState message="Không tìm thấy BSC."/></main>;

  const isOwner = state.user?.id === bsc.employee_id, isReviewer = state.user?.id === bsc.direct_manager_id;
  const isCanonicalManager = state.user?.roles.some(role => role.code === 'MANAGER') ?? false;
  const hasReviewPermission = (permission: string) => !isOwner && ((!isCanonicalManager && isReviewer && permissions.includes(permission))
    || (state.user?.roles.some(role => role.code === 'DIRECTOR'
      && role.permissions?.includes(permission)
      && (role.scopeType === 'GLOBAL' || (role.scopeType === 'DEPARTMENT' && role.scopeId === bsc.department_id))) ?? false));
  const cycleOpen = bsc.bsc_cycles.status === 'OPEN';
  const cycleBlockReason = bsc.bsc_cycles.status === 'LOCKED' ? 'Kỳ BSC đang bị khóa. Chủ sở hữu tạm thời không thể tạo, sửa hoặc nộp BSC.'
    : bsc.bsc_cycles.status === 'CLOSED' ? 'Kỳ BSC đang ở trạng thái CLOSED lịch sử.'
    : bsc.bsc_cycles.status === 'DRAFT' ? 'Kỳ BSC chưa mở.'
    : null;
  const planEditable = ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status) && bsc.evaluation_status === 'NOT_STARTED';
  const evaluationEditable = bsc.plan_status === 'APPROVED' && ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status);
  const canManage = cycleOpen && planEditable && ((isOwner && permissions.includes(BSC_PERMISSIONS.EDIT_OWN))
    || (!isCanonicalManager && bsc.plan_status !== 'REOPENED' && isReviewer && permissions.includes(BSC_PERMISSIONS.MANAGE_KPI)));
  const canActual = cycleOpen && evaluationEditable && isOwner && permissions.some(value => value === BSC_PERMISSIONS.EDIT_OWN || value === BSC_PERMISSIONS.UPDATE_ACTUAL);
  const canSubmitPlan = cycleOpen && planEditable && isOwner && permissions.includes(BSC_PERMISSIONS.SUBMIT_PLAN_OWN);
  const canSubmitEvaluation = cycleOpen && evaluationEditable && isOwner && permissions.includes(BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN);
  const reviewCycleAllowed = ['OPEN', 'LOCKED'].includes(bsc.bsc_cycles.status);
  const canApprovePlan = reviewCycleAllowed && bsc.plan_status === 'SUBMITTED' && hasReviewPermission(BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE);
  const canReturnPlan = reviewCycleAllowed && bsc.plan_status === 'SUBMITTED' && hasReviewPermission(BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE);
  const canApproveEvaluation = reviewCycleAllowed && bsc.evaluation_status === 'SUBMITTED' && hasReviewPermission(BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE);
  const canReturnEvaluation = reviewCycleAllowed && bsc.evaluation_status === 'SUBMITTED' && hasReviewPermission(BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE);
  const planPending = reopenRequests.some(value => value.stage === 'PLAN' && value.status === 'PENDING');
  const evaluationPending = reopenRequests.some(value => value.stage === 'EVALUATION' && value.status === 'PENDING');
  const canRequestPlan = isOwner && bsc.plan_status === 'APPROVED' && !planPending && permissions.includes(BSC_PERMISSIONS.REQUEST_REOPEN);
  const canRequestEvaluation = isOwner && bsc.evaluation_status === 'APPROVED' && !evaluationPending && permissions.includes(BSC_PERMISSIONS.REQUEST_REOPEN);
  const canReviewReopen = hasReviewPermission(BSC_PERMISSIONS.REVIEW_REOPEN);
  const canDuplicate = isOwner && permissions.includes(BSC_PERMISSIONS.DUPLICATE_OWN) && versions.some(value => value.versionType === 'PLAN_APPROVED');
  const planReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(value => value.stage === 'PLAN' && value.action === 'RETURN_PLAN');
  const evaluationReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(value => value.stage === 'EVALUATION' && value.action === 'RETURN_EVALUATION');
  const visibleHistory = (bsc.bsc_status_histories ?? []).filter(value => value.stage === 'PLAN'
    ? permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY) : permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY));
  const items = bsc.employee_bsc_items ?? [], totalWeight = items.reduce((sum, item) => sum + Number(item.weight), 0);
  const planComplete = items.length > 0 && Math.abs(totalWeight - 100) < 0.000001 && items.every(item => item.kpi_name.trim()
    && (item.target_value !== null || Boolean(item.target_text?.trim())) && ['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY'].includes(item.calculation_method));
  const remove = async () => {
    const accepted = await confirm({
      title: 'Xóa BSC các nhân?',
      description: 'BSC nháp và toàn bộ KPI bên trong sẽ bị xóa. Hành động này không thể hoàn tác.',
      confirmLabel: 'Xóa BSC',
      tone: 'destructive',
    });
    if (!accepted) return;
    try { await employeeBscApi.delete(bsc.id); navigate('/employee-bsc'); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xóa BSC.'); }
  };

  const exportExcel = async () => {
    setExporting(true); setActionError('');
    try {
      downloadBrowserFile(await employeeBscApi.exportExcel(bsc.employee_id, bsc.cycle_id));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Không thể xuất Excel.');
    } finally { setExporting(false); }
  };

  return <main aria-label="Chi tiết BSC">
    <PageHeader
      title={bsc.bsc_code}
      description={`${bsc.users_employee_bsc_employee_idTousers.full_name} · ${bsc.bsc_cycles.name} · ${bsc.departments.name}`}
      action={<Button variant="outline" asChild><Link to="/employee-bsc">Quay lại danh sách</Link></Button>}
    >
      <div className="action-bar" aria-label="Trạng thái BSC">
        <span>Kế hoạch <BscStatusBadge status={bsc.plan_status}/></span>
        <span>Đánh giá <BscStatusBadge status={bsc.evaluation_status}/></span>
      </div>
    </PageHeader>
    {cycleBlockReason && <Alert variant="destructive"><AlertTitle>Kỳ BSC không khả dụng</AlertTitle><AlertDescription>{cycleBlockReason}</AlertDescription></Alert>}
    {bsc.plan_status === 'RETURNED' && planReturn && <Alert variant="destructive"><AlertTitle>Nội dung BSC bị trả lại</AlertTitle><AlertDescription>{planReturn.comment}<br/>Bởi {planReturn.users.full_name}, {formatDate(planReturn.changed_at)}</AlertDescription></Alert>}
    {bsc.evaluation_status === 'RETURNED' && evaluationReturn && <Alert variant="destructive"><AlertTitle>Kết quả đánh giá bị trả lại</AlertTitle><AlertDescription>{evaluationReturn.comment}<br/>Bởi {evaluationReturn.users.full_name}, {formatDate(evaluationReturn.changed_at)}</AlertDescription></Alert>}
    {bsc.plan_status === 'REOPENED' && <Alert><AlertTitle>Kế hoạch đã được mở lại</AlertTitle><AlertDescription>Dữ liệu đánh giá hiện tại đã đặt lại; hãy sửa và gửi duyệt kế hoạch lại.</AlertDescription></Alert>}
    {bsc.evaluation_status === 'REOPENED' && <Alert><AlertTitle>Kết quả đã được mở lại</AlertTitle><AlertDescription>Định nghĩa KPI vẫn khóa và điểm hiện tại chỉ là dự kiến.</AlertDescription></Alert>}
    {bsc.plan_status === 'SUBMITTED' && <Alert><AlertTitle>Đang chờ duyệt nội dung BSC</AlertTitle></Alert>}{bsc.evaluation_status === 'SUBMITTED' && <Alert><AlertTitle>Đang chờ duyệt kết quả</AlertTitle></Alert>}
    <div className="action-bar" aria-label="Thao tác BSC">{isOwner && <PermissionGate permission={BSC_PERMISSIONS.EXPORT}><Button variant="outline" type="button" disabled={exporting} onClick={() => void exportExcel()}>{exporting && <Spinner/>}{exporting ? 'Đang xuất…' : 'Xuất Excel'}</Button></PermissionGate>}
    {isOwner && cycleOpen && planEditable && <PermissionGate permission={BSC_PERMISSIONS.EDIT_OWN}><Button variant="outline" asChild><Link to={`/employee-bsc/${bsc.id}/edit`}>Sửa ghi chú</Link></Button></PermissionGate>}
    {isOwner && cycleOpen && bsc.plan_status === 'DRAFT' && bsc.evaluation_status === 'NOT_STARTED' && <PermissionGate permission={BSC_PERMISSIONS.DELETE_OWN}><Button variant="destructive" onClick={() => void remove()}>Xóa BSC</Button></PermissionGate>}
    {canSubmitPlan && <Button disabled={Boolean(action) || !planComplete} title={!planComplete ? 'Tổng trọng số KPI phải bằng 100%' : undefined} onClick={() => void runAction('submitPlan')}>{action === 'submitPlan' && <Spinner/>}{action === 'submitPlan' ? 'Đang gửi…' : 'Gửi duyệt BSC'}</Button>}
    {canApprovePlan && <Button disabled={Boolean(action)} onClick={() => void runAction('approvePlan')}>{action === 'approvePlan' && <Spinner/>}Duyệt BSC</Button>}
    {canReturnPlan && <Button variant="outline" disabled={Boolean(action)} onClick={() => setReturnStage('PLAN')}>Trả lại BSC</Button>}
    {canSubmitEvaluation && <Button disabled={Boolean(action) || !scoring?.isComplete} onClick={() => void runAction('submitEvaluation')}>{action === 'submitEvaluation' && <Spinner/>}{action === 'submitEvaluation' ? 'Đang gửi…' : 'Gửi duyệt kết quả'}</Button>}
    {canApproveEvaluation && <Button disabled={Boolean(action)} onClick={() => void runAction('approveEvaluation')}>{action === 'approveEvaluation' && <Spinner/>}Duyệt kết quả</Button>}
    {canReturnEvaluation && <Button variant="outline" disabled={Boolean(action)} onClick={() => setReturnStage('EVALUATION')}>Trả lại kết quả</Button>}
    {canRequestPlan && <Button variant="outline" onClick={() => { setReopenStage('PLAN'); setReopenReason(''); }}>Yêu cầu sửa kế hoạch</Button>}
    {canRequestEvaluation && <Button variant="outline" onClick={() => { setReopenStage('EVALUATION'); setReopenReason(''); }}>Yêu cầu sửa kết quả đánh giá</Button>}
    {canDuplicate && <Button variant="outline" onClick={() => void openDuplicate()}>Sao chép BSC</Button>}</div>
    {actionError && <ErrorState error={actionError}/>} {reopenError && <ErrorState error={reopenError}/>} {' '}
    <AccessibleDialog open={Boolean(returnStage)} title={`Trả lại ${returnStage === 'PLAN' ? 'kế hoạch BSC' : 'kết quả đánh giá'}`} description="BSC sẽ được mở lại đúng nhóm trường của giai đoạn này. Lý do sẽ được lưu trong lịch sử." onClose={() => setReturnStage(null)} busy={Boolean(action)}><FormField label="Lý do trả lại" error={!returnReason.trim() ? 'Vui lòng nhập lý do rõ ràng.' : undefined}><Textarea aria-invalid={!returnReason.trim()} maxLength={2000} rows={5} value={returnReason} onChange={event => setReturnReason(event.target.value)} /></FormField><div className="dialog-actions"><Button disabled={Boolean(action) || !returnReason.trim()} onClick={() => void runAction(returnStage === 'PLAN' ? 'returnPlan' : 'returnEvaluation')}>{action && <Spinner/>}Xác nhận trả lại</Button><Button variant="outline" disabled={Boolean(action)} onClick={() => setReturnStage(null)}>Hủy</Button></div></AccessibleDialog>
    <AccessibleDialog open={Boolean(reopenStage)} title={reopenStage === 'PLAN' ? 'Yêu cầu sửa kế hoạch' : 'Yêu cầu sửa kết quả đánh giá'} description={reopenStage === 'PLAN' ? 'Khi được duyệt, dữ liệu đánh giá hiện tại sẽ được lưu vào lịch sử và đặt lại.' : 'Định nghĩa KPI vẫn khóa; điểm và xếp loại hiện tại sẽ chuyển vào lịch sử.'} onClose={() => setReopenStage(null)} busy={mutationPending.current}><FormField label="Lý do mở lại" error={!reopenReason.trim() ? 'Vui lòng nhập lý do mở lại.' : undefined}><Textarea aria-invalid={!reopenReason.trim()} maxLength={2000} rows={5} value={reopenReason} onChange={event => setReopenReason(event.target.value)} /></FormField><div className="dialog-actions"><Button disabled={!reopenReason.trim() || mutationPending.current} onClick={() => void requestReopen()}>{mutationPending.current && <Spinner/>}Gửi yêu cầu</Button><Button variant="outline" onClick={() => setReopenStage(null)}>Hủy</Button></div></AccessibleDialog>
    <AccessibleDialog open={Boolean(rejectingReopen)} title="Từ chối yêu cầu mở lại" description="BSC tiếp tục giữ trạng thái đã duyệt và lý do từ chối được lưu vào lịch sử." onClose={() => setRejectingReopen(null)} busy={Boolean(reopenActionId)}><FormField label="Lý do từ chối" error={!reopenRejectReason.trim() ? 'Vui lòng nhập lý do cụ thể.' : undefined}><Textarea aria-invalid={!reopenRejectReason.trim()} maxLength={2000} rows={5} value={reopenRejectReason} onChange={event => setReopenRejectReason(event.target.value)} /></FormField><div className="dialog-actions"><Button variant="destructive" disabled={!reopenRejectReason.trim() || Boolean(reopenActionId)} onClick={() => void rejectReopen()}>{reopenActionId && <Spinner/>}Xác nhận từ chối</Button><Button variant="outline" disabled={Boolean(reopenActionId)} onClick={() => setRejectingReopen(null)}>Hủy</Button></div></AccessibleDialog>
    {(planPending || evaluationPending) && <p role="status">Yêu cầu mở lại đang chờ xử lý. BSC vẫn ở chế độ chỉ xem.</p>}
    {duplicateLoading && <LoadingState/>}{duplicateError && <ErrorState error={duplicateError}/>} {' '}
    <AccessibleDialog open={Boolean(duplicateOptions)} title="Sao chép BSC" description="Sao chép dữ liệu phiên bản 1; nếu chưa có phiên bản 1 thì tạo BSC trắng." onClose={() => setDuplicateOptions(null)} busy={mutationPending.current}>{duplicateOptions && <><p>{duplicateOptions.sourceVersion ? `BSC nguồn có dữ liệu: phiên bản ${duplicateOptions.sourceVersion.versionNumber} · ${duplicateOptions.sourceVersion.summary.itemCount} KPI · tổng tỷ trọng ${String(duplicateOptions.sourceVersion.summary.totalWeight ?? '—')}%.` : 'BSC nguồn chưa có phiên bản 1; BSC mới sẽ để trống.'}</p>{duplicateOptions.cycles.length === 0 ? <p role="status">Chưa có kỳ tháng nào sau {bsc.bsc_cycles.name} đang mở và chưa có BSC của bạn. Hãy nhờ quản trị viên tạo hoặc mở kỳ tiếp theo rồi thử lại.</p> : <FormField label="Kỳ đích"><select value={targetCycleId} onChange={event => setTargetCycleId(event.target.value)}>{duplicateOptions.cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></FormField>}<div className="dialog-actions">{duplicateOptions.cycles.length > 0 && <Button disabled={!targetCycleId || mutationPending.current} onClick={() => void duplicate()}>{mutationPending.current && <Spinner/>}Xác nhận sao chép</Button>}<Button variant="outline" onClick={() => setDuplicateOptions(null)}>Hủy</Button></div></>}</AccessibleDialog>
    {bsc.plan_status === 'APPROVED' && (scoringLoading ? <LoadingState/> : scoringError ? <ErrorState error={scoringError} onRetry={() => void loadScoring(true)}/> : scoring && <BscScoreSummary preview={scoring} isOfficial={bsc.evaluation_status === 'APPROVED'}/>)}
    <BscItemTable bscId={bsc.id} goalGroups={bsc.goal_groups ?? []} items={items} scoring={scoring} canManage={canManage} canUpdateActual={canActual} isOfficial={bsc.evaluation_status === 'APPROVED'} onChange={refreshBscAndScoring}/>
    {permissions.includes(BSC_PERMISSIONS.VIEW_VERSION) && <section><h2>Lịch sử phiên bản</h2>{versionsLoading ? <LoadingState/> : versionsError ? <ErrorState error={versionsError} onRetry={() => void loadVersions()}/> : versions.length === 0 ? <EmptyState message="Chưa có phiên bản đã duyệt."/> : <ol>{versions.map(version => <li key={version.id}>Phiên bản {version.versionNumber} — {stageLabel(version.stage)} — {versionTypeLabel(version.versionType)} — {version.createdBy.full_name}, {formatDate(version.createdAt)} {version.summary.finalGrade ? `— ${String(version.summary.totalScore)} / ${String(version.summary.finalGrade)}` : ''} <Button variant="outline" size="sm" onClick={() => void showVersion(version.id)}>Xem chi tiết</Button></li>)}</ol>}{versionDetailLoading && <LoadingState/>}</section>}
    <AccessibleDialog open={Boolean(versionDetail)} title={`Phiên bản ${versionDetail?.versionNumber ?? ''}`} description={versionDetail ? `${stageLabel(versionDetail.stage)} · ${versionTypeLabel(versionDetail.versionType)}` : 'Chi tiết phiên bản BSC'} onClose={() => setVersionDetail(null)}>{versionDetail && <><pre>{JSON.stringify(versionDetail.snapshot, null, 2)}</pre><div className="dialog-actions"><Button variant="outline" onClick={() => setVersionDetail(null)}>Đóng</Button></div></>}</AccessibleDialog>
    <section><h2>Lịch sử yêu cầu mở lại</h2>{reopenError ? <ErrorState error={reopenError}/> : reopenRequests.length === 0 ? <EmptyState message="Chưa có yêu cầu mở lại."/> : <ol>{reopenRequests.map(request => <li key={request.id}><strong>{stageLabel(request.stage)}</strong> — <BscStatusBadge status={request.status}/> — yêu cầu bởi {request.users_bsc_unlock_requests_requested_byTousers.full_name}, {formatDate(request.requested_at)}<br/>Lý do: {request.request_reason}{request.reviewed_at && <><br/>Xử lý bởi {request.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}, {formatDate(request.reviewed_at)}{request.review_comment ? `: ${request.review_comment}` : ''}</>}{request.status === 'PENDING' && canReviewReopen && <div className="dialog-actions"><Button disabled={Boolean(reopenActionId)} onClick={() => void approveReopen(request)}>{reopenActionId === request.id && <Spinner/>}{reopenActionId === request.id ? 'Đang xử lý…' : 'Duyệt mở lại'}</Button><Button variant="outline" disabled={Boolean(reopenActionId)} onClick={() => { setRejectingReopen(request); setReopenRejectReason(''); }}>Từ chối mở lại</Button></div>}</li>)}</ol>}</section>
    {(permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY) || permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY)) && <section><h2>Lịch sử trạng thái</h2>{visibleHistory.length === 0 ? <EmptyState message="Chưa có thay đổi trạng thái."/> : <ol>{visibleHistory.map(history => <li key={history.id}><strong>{history.stage === 'PLAN' ? 'Nội dung' : 'Kết quả'}:</strong> <BscStatusBadge status={history.to_status}/> — {history.users.full_name}, {formatDate(history.changed_at)}{history.comment ? `: ${history.comment}` : ''}</li>)}</ol>}</section>}
  </main>;
};
