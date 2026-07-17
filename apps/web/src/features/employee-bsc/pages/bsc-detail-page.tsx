import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, FormField, LoadingState, PageHeader } from '../../organization/management-ui';
import { BscItemTable } from '../components/bsc-item-table';
import { BscScoreSummary } from '../components/bsc-score-summary';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscDuplicateOptions, BscReopenRequest, BscScoringPreview, BscVersionDetail, BscVersionSummary, EmployeeBsc } from '../types/employee-bsc.types';

type WorkflowAction = 'submitPlan' | 'approvePlan' | 'returnPlan' | 'submitEvaluation' | 'approveEvaluation' | 'returnEvaluation';
type Stage = 'PLAN' | 'EVALUATION';
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const stageLabel = (stage: string) => stage === 'PLAN' ? 'Kế hoạch' : stage === 'EVALUATION' ? 'Kết quả đánh giá' : 'Toàn bộ BSC';
const versionTypeLabel = (type: string) => ({ PLAN_APPROVED: 'Kế hoạch đã duyệt', EVALUATION_APPROVED: 'Kết quả đã duyệt', PRE_REOPEN: 'Trước khi mở lại' }[type] ?? 'Phiên bản BSC');

export const BscDetailPage: React.FC = () => {
  const { id = '' } = useParams(), navigate = useNavigate(), { state } = useAuthContext();
  const permissions = state.user?.permissions ?? [];
  const [bsc, setBsc] = useState<EmployeeBsc | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [scoring, setScoring] = useState<BscScoringPreview | null>(null), [scoringLoading, setScoringLoading] = useState(true), [scoringError, setScoringError] = useState('');
  const [versions, setVersions] = useState<BscVersionSummary[]>([]), [versionsLoading, setVersionsLoading] = useState(false), [versionsError, setVersionsError] = useState('');
  const [reopenRequests, setReopenRequests] = useState<BscReopenRequest[]>([]), [reopenError, setReopenError] = useState('');
  const [action, setAction] = useState<WorkflowAction | null>(null), [actionError, setActionError] = useState('');
  const [returnStage, setReturnStage] = useState<Stage | null>(null), [returnReason, setReturnReason] = useState('');
  const [reopenStage, setReopenStage] = useState<Stage | null>(null), [reopenReason, setReopenReason] = useState('');
  const [duplicateOptions, setDuplicateOptions] = useState<BscDuplicateOptions | null>(null), [targetCycleId, setTargetCycleId] = useState('');
  const [duplicateLoading, setDuplicateLoading] = useState(false), [duplicateError, setDuplicateError] = useState('');
  const [versionDetail, setVersionDetail] = useState<BscVersionDetail | null>(null), [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const mutationPending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setBsc(await employeeBscApi.detail(id)); }
    catch (cause) { setBsc(null); setError(cause instanceof Error ? cause.message : 'Không thể tải BSC.'); }
    finally { setLoading(false); }
  }, [id]);
  const loadScoring = useCallback(async () => {
    setScoringLoading(true); setScoringError(''); setScoring(null);
    try { setScoring(await employeeBscApi.scoringPreview(id)); }
    catch (cause) { setScoringError(cause instanceof Error ? cause.message : 'Không thể tải điểm tạm tính.'); }
    finally { setScoringLoading(false); }
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
  const reloadAll = useCallback(async () => { await Promise.all([load(), loadScoring(), loadVersions(), loadReopenRequests()]); }, [load, loadScoring, loadVersions, loadReopenRequests]);
  useEffect(() => { void reloadAll(); }, [reloadAll]);

  const runAction = async (kind: WorkflowAction) => {
    if (mutationPending.current) return;
    if (kind.startsWith('return') && !returnReason.trim()) { setActionError('Vui lòng nhập lý do trả lại.'); return; }
    if (!kind.startsWith('return') && !window.confirm(kind.includes('Plan') ? 'Xác nhận xử lý giai đoạn duyệt nội dung BSC?' : 'Xác nhận xử lý giai đoạn duyệt kết quả?')) return;
    mutationPending.current = true; setAction(kind); setActionError('');
    try {
      if (kind === 'submitPlan') await employeeBscApi.submitPlan(id);
      else if (kind === 'approvePlan') await employeeBscApi.approvePlan(id);
      else if (kind === 'returnPlan') await employeeBscApi.returnPlan(id, returnReason);
      else if (kind === 'submitEvaluation') await employeeBscApi.submitEvaluation(id);
      else if (kind === 'approveEvaluation') await employeeBscApi.approveEvaluation(id);
      else await employeeBscApi.returnEvaluation(id, returnReason);
      setReturnStage(null); setReturnReason(''); setBsc(null); setScoring(null); await reloadAll();
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
  if (error) return <main><ErrorState error={error}/><button onClick={() => void reloadAll()}>Thử lại</button> <Link to="/employee-bsc">Quay lại</Link></main>;
  if (!bsc) return <main><EmptyState message="Không tìm thấy BSC."/></main>;

  const isOwner = state.user?.id === bsc.employee_id, isReviewer = state.user?.id === bsc.direct_manager_id;
  const cycleOpen = bsc.bsc_cycles.status === 'OPEN';
  const cycleBlockReason = bsc.bsc_cycles.status === 'LOCKED' ? 'Kỳ BSC đang bị khóa. Chủ sở hữu tạm thời không thể tạo, sửa hoặc nộp BSC.'
    : bsc.bsc_cycles.status === 'CLOSED' ? 'Kỳ BSC đang ở trạng thái CLOSED lịch sử.'
    : bsc.bsc_cycles.status === 'DRAFT' ? 'Kỳ BSC chưa mở.'
    : null;
  const planEditable = ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status) && bsc.evaluation_status === 'NOT_STARTED';
  const evaluationEditable = bsc.plan_status === 'APPROVED' && ['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status);
  const canManage = cycleOpen && planEditable && ((isOwner && permissions.includes(BSC_PERMISSIONS.EDIT_OWN))
    || (bsc.plan_status !== 'REOPENED' && isReviewer && permissions.includes(BSC_PERMISSIONS.MANAGE_KPI)));
  const canActual = cycleOpen && evaluationEditable && isOwner && permissions.some(value => value === BSC_PERMISSIONS.EDIT_OWN || value === BSC_PERMISSIONS.UPDATE_ACTUAL);
  const canSubmitPlan = cycleOpen && planEditable && isOwner && permissions.includes(BSC_PERMISSIONS.SUBMIT_PLAN_OWN);
  const canSubmitEvaluation = cycleOpen && evaluationEditable && isOwner && permissions.includes(BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN);
  const reviewCycleAllowed = ['OPEN', 'LOCKED'].includes(bsc.bsc_cycles.status);
  const canApprovePlan = reviewCycleAllowed && bsc.plan_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE);
  const canReturnPlan = reviewCycleAllowed && bsc.plan_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE);
  const canApproveEvaluation = reviewCycleAllowed && bsc.evaluation_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE);
  const canReturnEvaluation = reviewCycleAllowed && bsc.evaluation_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE);
  const planPending = reopenRequests.some(value => value.stage === 'PLAN' && value.status === 'PENDING');
  const evaluationPending = reopenRequests.some(value => value.stage === 'EVALUATION' && value.status === 'PENDING');
  const canRequestPlan = isOwner && bsc.plan_status === 'APPROVED' && !planPending && permissions.includes(BSC_PERMISSIONS.REQUEST_REOPEN);
  const canRequestEvaluation = isOwner && bsc.evaluation_status === 'APPROVED' && !evaluationPending && permissions.includes(BSC_PERMISSIONS.REQUEST_REOPEN);
  const canDuplicate = isOwner && permissions.includes(BSC_PERMISSIONS.DUPLICATE_OWN) && versions.some(value => value.versionType === 'PLAN_APPROVED');
  const planReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(value => value.stage === 'PLAN' && value.action === 'RETURN_PLAN');
  const evaluationReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(value => value.stage === 'EVALUATION' && value.action === 'RETURN_EVALUATION');
  const visibleHistory = (bsc.bsc_status_histories ?? []).filter(value => value.stage === 'PLAN'
    ? permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY) : permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY));
  const items = bsc.employee_bsc_items ?? [], totalWeight = items.reduce((sum, item) => sum + Number(item.weight), 0);
  const planComplete = items.length > 0 && Math.abs(totalWeight - 100) < 0.000001 && items.every(item => item.kpi_name.trim()
    && (item.target_value !== null || Boolean(item.target_text?.trim())) && ['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY'].includes(item.calculation_method));
  const remove = async () => { if (!window.confirm('Xóa BSC nháp này?')) return; try { await employeeBscApi.delete(bsc.id); navigate('/employee-bsc'); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xóa BSC.'); } };

  return <main>
    <PageHeader title={bsc.bsc_code} description={`${bsc.users_employee_bsc_employee_idTousers.full_name} · ${bsc.bsc_cycles.name}`} breadcrumb={<Link to="/employee-bsc">BSC / Chi tiết</Link>} action={<Link to="/employee-bsc">Quay lại danh sách</Link>}/>
    {cycleBlockReason && <p role="alert">{cycleBlockReason}</p>}
    {bsc.plan_status === 'RETURNED' && planReturn && <section role="alert"><h2>Nội dung BSC bị trả lại</h2><p>{planReturn.comment}</p><p>Bởi {planReturn.users.full_name}, {formatDate(planReturn.changed_at)}</p></section>}
    {bsc.evaluation_status === 'RETURNED' && evaluationReturn && <section role="alert"><h2>Kết quả đánh giá bị trả lại</h2><p>{evaluationReturn.comment}</p><p>Bởi {evaluationReturn.users.full_name}, {formatDate(evaluationReturn.changed_at)}</p></section>}
    {bsc.plan_status === 'REOPENED' && <p role="alert">Kế hoạch đã được mở lại. Dữ liệu đánh giá active đã đặt lại; hãy sửa và gửi duyệt kế hoạch lại.</p>}
    {bsc.evaluation_status === 'REOPENED' && <p role="alert">Kết quả đã được mở lại. Định nghĩa KPI vẫn khóa và điểm hiện tại chỉ là dự kiến.</p>}
    <section aria-labelledby="general-information"><h2 id="general-information">Thông tin chung</h2><dl><dt>Nhân viên</dt><dd>{bsc.users_employee_bsc_employee_idTousers.full_name}</dd><dt>Kỳ</dt><dd>{bsc.bsc_cycles.name} · {bsc.bsc_cycles.status}</dd><dt>Ngày kết thúc thực tế</dt><dd>{formatDate(bsc.bsc_cycles.end_date)}</dd><dt>Đơn vị</dt><dd>{bsc.departments.name}</dd>
      <dt>Duyệt nội dung BSC</dt><dd><BscStatusBadge status={bsc.plan_status}/></dd><dt>Đánh giá kết quả</dt><dd><BscStatusBadge status={bsc.evaluation_status}/></dd>
      <dt>Quản lý trực tiếp</dt><dd>{bsc.users_employee_bsc_direct_manager_idTousers?.full_name ?? '—'}</dd><dt>Ngày gửi nội dung</dt><dd>{formatDate(bsc.plan_submitted_at)}</dd><dt>Ngày duyệt nội dung</dt><dd>{formatDate(bsc.plan_approved_at)}</dd>
      <dt>Ngày gửi kết quả</dt><dd>{formatDate(bsc.evaluation_submitted_at)}</dd><dt>Ngày duyệt kết quả</dt><dd>{formatDate(bsc.evaluation_approved_at)}</dd>
      {bsc.evaluation_status === 'APPROVED' && <><dt>Điểm chính thức</dt><dd>{bsc.final_score ?? '—'}</dd><dt>Xếp loại</dt><dd>{bsc.final_grade ?? '—'}</dd></>}
      <dt>Ghi chú</dt><dd>{bsc.employee_comment || '—'}</dd>{bsc.source_bsc_id && <><dt>Nguồn sao chép</dt><dd>{bsc.source_bsc_id} / {bsc.source_bsc_version_id}</dd></>}
    </dl></section>
    {bsc.plan_status === 'SUBMITTED' && <p>Đang chờ duyệt nội dung BSC.</p>}{bsc.evaluation_status === 'SUBMITTED' && <p>Đang chờ duyệt kết quả.</p>}
    <div className="action-bar" aria-label="Thao tác BSC">{isOwner && cycleOpen && planEditable && <PermissionGate permission={BSC_PERMISSIONS.EDIT_OWN}><Link to={`/employee-bsc/${bsc.id}/edit`}>Sửa ghi chú</Link></PermissionGate>} {' '}
    {isOwner && cycleOpen && bsc.plan_status === 'DRAFT' && bsc.evaluation_status === 'NOT_STARTED' && <PermissionGate permission={BSC_PERMISSIONS.DELETE_OWN}><button onClick={() => void remove()}>Xóa BSC</button></PermissionGate>} {' '}
    {canSubmitPlan && <button disabled={Boolean(action) || !planComplete} title={!planComplete ? 'Tổng trọng số KPI phải bằng 100%' : undefined} onClick={() => void runAction('submitPlan')}>{action === 'submitPlan' ? 'Đang gửi…' : 'Gửi duyệt BSC'}</button>} {' '}
    {canApprovePlan && <button disabled={Boolean(action)} onClick={() => void runAction('approvePlan')}>Duyệt BSC</button>} {' '}
    {canReturnPlan && <button disabled={Boolean(action)} onClick={() => setReturnStage('PLAN')}>Trả lại BSC</button>} {' '}
    {canSubmitEvaluation && <button disabled={Boolean(action) || !scoring?.isComplete} onClick={() => void runAction('submitEvaluation')}>{action === 'submitEvaluation' ? 'Đang gửi…' : 'Gửi duyệt kết quả'}</button>} {' '}
    {canApproveEvaluation && <button disabled={Boolean(action)} onClick={() => void runAction('approveEvaluation')}>Duyệt kết quả</button>} {' '}
    {canReturnEvaluation && <button disabled={Boolean(action)} onClick={() => setReturnStage('EVALUATION')}>Trả lại kết quả</button>} {' '}
    {canRequestPlan && <button onClick={() => { setReopenStage('PLAN'); setReopenReason(''); }}>Yêu cầu sửa kế hoạch</button>} {' '}
    {canRequestEvaluation && <button onClick={() => { setReopenStage('EVALUATION'); setReopenReason(''); }}>Yêu cầu sửa kết quả đánh giá</button>} {' '}
    {canDuplicate && <button onClick={() => void openDuplicate()}>Sao chép BSC</button>}</div>
    {actionError && <ErrorState error={actionError}/>} {reopenError && <ErrorState error={reopenError}/>} {' '}
    <AccessibleDialog open={Boolean(returnStage)} title={`Trả lại ${returnStage === 'PLAN' ? 'kế hoạch BSC' : 'kết quả đánh giá'}`} description="BSC sẽ được mở lại đúng nhóm trường của giai đoạn này. Lý do sẽ được lưu trong lịch sử." onClose={() => setReturnStage(null)} busy={Boolean(action)}><FormField label="Lý do trả lại" error={!returnReason.trim() ? 'Vui lòng nhập lý do rõ ràng.' : undefined}><textarea maxLength={2000} rows={5} value={returnReason} onChange={event => setReturnReason(event.target.value)} /></FormField><div className="dialog-actions"><button disabled={Boolean(action) || !returnReason.trim()} onClick={() => void runAction(returnStage === 'PLAN' ? 'returnPlan' : 'returnEvaluation')}>Xác nhận trả lại</button><button disabled={Boolean(action)} onClick={() => setReturnStage(null)}>Hủy</button></div></AccessibleDialog>
    <AccessibleDialog open={Boolean(reopenStage)} title={reopenStage === 'PLAN' ? 'Yêu cầu sửa kế hoạch' : 'Yêu cầu sửa kết quả đánh giá'} description={reopenStage === 'PLAN' ? 'Khi được duyệt, dữ liệu đánh giá hiện tại sẽ được lưu vào lịch sử và đặt lại.' : 'Định nghĩa KPI vẫn khóa; điểm và xếp loại hiện tại sẽ chuyển vào lịch sử.'} onClose={() => setReopenStage(null)} busy={mutationPending.current}><FormField label="Lý do mở lại" error={!reopenReason.trim() ? 'Vui lòng nhập lý do mở lại.' : undefined}><textarea maxLength={2000} rows={5} value={reopenReason} onChange={event => setReopenReason(event.target.value)} /></FormField><div className="dialog-actions"><button disabled={!reopenReason.trim() || mutationPending.current} onClick={() => void requestReopen()}>Gửi yêu cầu</button><button onClick={() => setReopenStage(null)}>Hủy</button></div></AccessibleDialog>
    {(planPending || evaluationPending) && <p role="status">Yêu cầu mở lại đang chờ xử lý. BSC vẫn ở chế độ chỉ xem.</p>}
    {duplicateLoading && <LoadingState/>}{duplicateError && <ErrorState error={duplicateError}/>} {' '}
    <AccessibleDialog open={Boolean(duplicateOptions)} title="Sao chép BSC" description="Chỉ nội dung kế hoạch đã duyệt được sao chép; kết quả, thuyết minh, điểm, xếp loại và lịch sử duyệt không được sao chép." onClose={() => setDuplicateOptions(null)} busy={mutationPending.current}>{duplicateOptions && <><p>Phiên bản nguồn: {duplicateOptions.sourceVersion.versionNumber} · {duplicateOptions.sourceVersion.summary.itemCount} KPI · tổng trọng số {String(duplicateOptions.sourceVersion.summary.totalWeight ?? '—')}%</p>{duplicateOptions.cycles.length === 0 ? <EmptyState message="Không có kỳ đang mở hợp lệ để sao chép."/> : <FormField label="Kỳ đích"><select value={targetCycleId} onChange={event => setTargetCycleId(event.target.value)}>{duplicateOptions.cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></FormField>}<div className="dialog-actions">{duplicateOptions.cycles.length > 0 && <button disabled={!targetCycleId || mutationPending.current} onClick={() => void duplicate()}>Xác nhận sao chép</button>}<button onClick={() => setDuplicateOptions(null)}>Hủy</button></div></>}</AccessibleDialog>
    {bsc.plan_status === 'APPROVED' && (scoringLoading ? <LoadingState/> : scoringError ? <ErrorState error={scoringError} onRetry={() => void loadScoring()}/> : scoring && <BscScoreSummary preview={scoring} isOfficial={bsc.evaluation_status === 'APPROVED'}/>)}
    <BscItemTable bscId={bsc.id} items={items} scoring={scoring} canManage={canManage} canUpdateActual={canActual} isOfficial={bsc.evaluation_status === 'APPROVED'} onChange={reloadAll}/>
    {permissions.includes(BSC_PERMISSIONS.VIEW_VERSION) && <section><h2>Lịch sử phiên bản</h2>{versionsLoading ? <LoadingState/> : versionsError ? <ErrorState error={versionsError} onRetry={() => void loadVersions()}/> : versions.length === 0 ? <EmptyState message="Chưa có phiên bản đã duyệt."/> : <ol>{versions.map(version => <li key={version.id}>Phiên bản {version.versionNumber} — {stageLabel(version.stage)} — {versionTypeLabel(version.versionType)} — {version.createdBy.full_name}, {formatDate(version.createdAt)} {version.summary.finalGrade ? `— ${String(version.summary.totalScore)} / ${String(version.summary.finalGrade)}` : ''} <button onClick={() => void showVersion(version.id)}>Xem chi tiết</button></li>)}</ol>}{versionDetailLoading && <LoadingState/>}</section>}
    <AccessibleDialog open={Boolean(versionDetail)} title={`Phiên bản ${versionDetail?.versionNumber ?? ''}`} description={versionDetail ? `${stageLabel(versionDetail.stage)} · ${versionTypeLabel(versionDetail.versionType)}` : 'Chi tiết phiên bản BSC'} onClose={() => setVersionDetail(null)}>{versionDetail && <><pre>{JSON.stringify(versionDetail.snapshot, null, 2)}</pre><div className="dialog-actions"><button onClick={() => setVersionDetail(null)}>Đóng</button></div></>}</AccessibleDialog>
    <section><h2>Lịch sử yêu cầu mở lại</h2>{reopenError ? <ErrorState error={reopenError}/> : reopenRequests.length === 0 ? <EmptyState message="Chưa có yêu cầu mở lại."/> : <ol>{reopenRequests.map(request => <li key={request.id}><strong>{stageLabel(request.stage)}</strong> — <BscStatusBadge status={request.status}/> — yêu cầu bởi {request.users_bsc_unlock_requests_requested_byTousers.full_name}, {formatDate(request.requested_at)}<br/>Lý do: {request.request_reason}{request.reviewed_at && <><br/>Xử lý bởi {request.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}, {formatDate(request.reviewed_at)}{request.review_comment ? `: ${request.review_comment}` : ''}</>}</li>)}</ol>}</section>
    {(permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY) || permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY)) && <section><h2>Lịch sử trạng thái</h2>{visibleHistory.length === 0 ? <EmptyState message="Chưa có thay đổi trạng thái."/> : <ol>{visibleHistory.map(history => <li key={history.id}><strong>{history.stage === 'PLAN' ? 'Nội dung' : 'Kết quả'}:</strong> <BscStatusBadge status={history.to_status}/> — {history.users.full_name}, {formatDate(history.changed_at)}{history.comment ? `: ${history.comment}` : ''}</li>)}</ol>}</section>}
  </main>;
};
