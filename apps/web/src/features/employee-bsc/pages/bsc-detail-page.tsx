import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { PermissionGate } from '../../auth/components/permission-gate';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../organization/management-ui';
import { BscItemTable } from '../components/bsc-item-table';
import { BscScoreSummary } from '../components/bsc-score-summary';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscScoringPreview, EmployeeBsc } from '../types/employee-bsc.types';

type Action = 'submitPlan' | 'approvePlan' | 'returnPlan' | 'submitEvaluation' | 'approveEvaluation' | 'returnEvaluation';
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

export const BscDetailPage: React.FC = () => {
  const { id = '' } = useParams(), navigate = useNavigate(), { state } = useAuthContext();
  const [bsc, setBsc] = useState<EmployeeBsc | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [scoring, setScoring] = useState<BscScoringPreview | null>(null), [scoringLoading, setScoringLoading] = useState(true), [scoringError, setScoringError] = useState('');
  const [action, setAction] = useState<Action | null>(null), [actionError, setActionError] = useState('');
  const actionPendingRef = useRef(false);
  const [returnStage, setReturnStage] = useState<'PLAN' | 'EVALUATION' | null>(null), [returnReason, setReturnReason] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setBsc(await employeeBscApi.detail(id)); } catch (cause) { setBsc(null); setError(cause instanceof Error ? cause.message : 'Không thể tải BSC.'); } finally { setLoading(false); } }, [id]);
  const loadScoring = useCallback(async () => { setScoringLoading(true); setScoringError(''); setScoring(null); try { setScoring(await employeeBscApi.scoringPreview(id)); } catch (cause) { setScoringError(cause instanceof Error ? cause.message : 'Không thể tải điểm tạm tính.'); } finally { setScoringLoading(false); } }, [id]);
  const reloadAll = useCallback(async () => { await Promise.all([load(), loadScoring()]); }, [load, loadScoring]);
  useEffect(() => { void reloadAll(); }, [reloadAll]);

  const runAction = async (kind: Action) => {
    if (actionPendingRef.current) return;
    if (kind.startsWith('return') && !returnReason.trim()) { setActionError('Vui lòng nhập lý do trả lại.'); return; }
    if (!kind.startsWith('return') && !window.confirm(kind.includes('Plan') ? 'Xác nhận xử lý giai đoạn duyệt nội dung BSC?' : 'Xác nhận xử lý giai đoạn duyệt kết quả?')) return;
    actionPendingRef.current = true;
    setAction(kind); setActionError('');
    try {
      if (kind === 'submitPlan') await employeeBscApi.submitPlan(id);
      else if (kind === 'approvePlan') await employeeBscApi.approvePlan(id);
      else if (kind === 'returnPlan') await employeeBscApi.returnPlan(id, returnReason);
      else if (kind === 'submitEvaluation') await employeeBscApi.submitEvaluation(id);
      else if (kind === 'approveEvaluation') await employeeBscApi.approveEvaluation(id);
      else await employeeBscApi.returnEvaluation(id, returnReason);
      setReturnStage(null); setReturnReason(''); setBsc(null); setScoring(null); await reloadAll();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xử lý BSC.'); }
    finally { actionPendingRef.current = false; setAction(null); }
  };

  if (loading) return <main><LoadingState/></main>;
  if (error) return <main><ErrorState error={error}/><button onClick={() => void reloadAll()}>Thử lại</button> <Link to="/employee-bsc">Quay lại</Link></main>;
  if (!bsc) return <main><EmptyState message="Không tìm thấy BSC."/></main>;

  const permissions = state.user?.permissions ?? [], isOwner = state.user?.id === bsc.employee_id, isReviewer = state.user?.id === bsc.direct_manager_id;
  const planEditable = (bsc.plan_status === 'DRAFT' || bsc.plan_status === 'RETURNED') && bsc.evaluation_status === 'NOT_STARTED';
  const evaluationEditable = bsc.plan_status === 'APPROVED' && (bsc.evaluation_status === 'DRAFT' || bsc.evaluation_status === 'RETURNED');
  const canManage = planEditable && isReviewer && permissions.includes(BSC_PERMISSIONS.MANAGE_KPI);
  const canActual = evaluationEditable && isOwner && permissions.some(permission => permission === BSC_PERMISSIONS.EDIT_OWN || permission === BSC_PERMISSIONS.UPDATE_ACTUAL);
  const canSubmitPlan = planEditable && isOwner && permissions.includes(BSC_PERMISSIONS.SUBMIT_PLAN_OWN);
  const canSubmitEvaluation = evaluationEditable && isOwner && permissions.includes(BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN);
  const canApprovePlan = bsc.plan_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE);
  const canReturnPlan = bsc.plan_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE);
  const canApproveEvaluation = bsc.evaluation_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE);
  const canReturnEvaluation = bsc.evaluation_status === 'SUBMITTED' && isReviewer && permissions.includes(BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE);
  const planReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(history => history.stage === 'PLAN' && history.action === 'RETURN_PLAN');
  const evaluationReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(history => history.stage === 'EVALUATION' && history.action === 'RETURN_EVALUATION');
  const visibleHistory = (bsc.bsc_status_histories ?? []).filter(history => history.stage === 'PLAN'
    ? permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY)
    : permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY));
  const items = bsc.employee_bsc_items ?? [], totalWeight = items.reduce((sum, item) => sum + Number(item.weight), 0);
  const planComplete = items.length > 0 && Math.abs(totalWeight - 100) < 0.000001 && items.every(item => item.kpi_name.trim() && (item.target_value !== null || Boolean(item.target_text?.trim())) && ['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY'].includes(item.calculation_method));
  const remove = async () => { if (!window.confirm('Xóa BSC nháp này?')) return; try { await employeeBscApi.delete(bsc.id); navigate('/employee-bsc'); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xóa BSC.'); } };

  return <main>
    <PageHeader title={bsc.bsc_code} action={<Link to="/employee-bsc">Danh sách</Link>}/>
    {bsc.plan_status === 'RETURNED' && planReturn && <section role="alert"><h2>Nội dung BSC bị trả lại</h2><p>{planReturn.comment}</p><p>Bởi {planReturn.users.full_name}, {formatDate(planReturn.changed_at)}</p></section>}
    {bsc.evaluation_status === 'RETURNED' && evaluationReturn && <section role="alert"><h2>Kết quả đánh giá bị trả lại</h2><p>{evaluationReturn.comment}</p><p>Bởi {evaluationReturn.users.full_name}, {formatDate(evaluationReturn.changed_at)}</p></section>}
    <dl><dt>Nhân viên</dt><dd>{bsc.users_employee_bsc_employee_idTousers.full_name}</dd><dt>Kỳ</dt><dd>{bsc.bsc_cycles.name}</dd><dt>Đơn vị</dt><dd>{bsc.departments.name}</dd>
      <dt>Duyệt nội dung BSC</dt><dd><BscStatusBadge status={bsc.plan_status}/></dd><dt>Đánh giá kết quả</dt><dd><BscStatusBadge status={bsc.evaluation_status}/></dd>
      <dt>Quản lý trực tiếp</dt><dd>{bsc.users_employee_bsc_direct_manager_idTousers?.full_name ?? '—'}</dd><dt>Ngày gửi nội dung</dt><dd>{formatDate(bsc.plan_submitted_at)}</dd><dt>Ngày duyệt nội dung</dt><dd>{formatDate(bsc.plan_approved_at)}</dd>
      <dt>Ngày gửi kết quả</dt><dd>{formatDate(bsc.evaluation_submitted_at)}</dd><dt>Ngày duyệt kết quả</dt><dd>{formatDate(bsc.evaluation_approved_at)}</dd>
      {bsc.evaluation_status === 'APPROVED' && <><dt>Điểm chính thức</dt><dd>{bsc.final_score ?? '—'}</dd><dt>Xếp loại</dt><dd>{bsc.final_grade ?? '—'}</dd></>}<dt>Ghi chú</dt><dd>{bsc.employee_comment || '—'}</dd>
    </dl>
    {bsc.plan_status === 'SUBMITTED' && <p>Đang chờ duyệt nội dung BSC.</p>}{bsc.evaluation_status === 'SUBMITTED' && <p>Đang chờ duyệt kết quả.</p>}
    {isOwner && planEditable && <PermissionGate permission={BSC_PERMISSIONS.EDIT_OWN}><Link to={`/employee-bsc/${bsc.id}/edit`}>Sửa ghi chú</Link></PermissionGate>} {' '}
    {isOwner && bsc.plan_status === 'DRAFT' && bsc.evaluation_status === 'NOT_STARTED' && <PermissionGate permission={BSC_PERMISSIONS.DELETE_OWN}><button onClick={() => void remove()}>Xóa BSC</button></PermissionGate>} {' '}
    {canSubmitPlan && <PermissionGate permission={BSC_PERMISSIONS.SUBMIT_PLAN_OWN}><button disabled={Boolean(action) || !planComplete} title={!planComplete ? 'Cần ít nhất một KPI hợp lệ và tổng trọng số đúng 100%.' : undefined} onClick={() => void runAction('submitPlan')}>{action === 'submitPlan' ? 'Đang gửi…' : 'Gửi duyệt BSC'}</button></PermissionGate>} {' '}
    {canApprovePlan && <PermissionGate permission={BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE}><button disabled={Boolean(action)} onClick={() => void runAction('approvePlan')}>Duyệt BSC</button></PermissionGate>} {' '}
    {canReturnPlan && <PermissionGate permission={BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE}><button disabled={Boolean(action)} onClick={() => setReturnStage('PLAN')}>Trả lại BSC</button></PermissionGate>} {' '}
    {canSubmitEvaluation && <PermissionGate permission={BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN}><button disabled={Boolean(action) || !scoring?.isComplete} onClick={() => void runAction('submitEvaluation')}>{action === 'submitEvaluation' ? 'Đang gửi…' : 'Gửi duyệt kết quả'}</button></PermissionGate>} {' '}
    {canApproveEvaluation && <PermissionGate permission={BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE}><button disabled={Boolean(action)} onClick={() => void runAction('approveEvaluation')}>Duyệt kết quả</button></PermissionGate>} {' '}
    {canReturnEvaluation && <PermissionGate permission={BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE}><button disabled={Boolean(action)} onClick={() => setReturnStage('EVALUATION')}>Trả lại kết quả</button></PermissionGate>}
    {returnStage && <section role="dialog" aria-modal="true"><h2>Trả lại {returnStage === 'PLAN' ? 'nội dung BSC' : 'kết quả đánh giá'}</h2><label>Lý do<textarea maxLength={2000} rows={5} value={returnReason} onChange={event => setReturnReason(event.target.value)} autoFocus/></label><button disabled={Boolean(action) || !returnReason.trim()} onClick={() => void runAction(returnStage === 'PLAN' ? 'returnPlan' : 'returnEvaluation')}>Xác nhận</button> <button disabled={Boolean(action)} onClick={() => setReturnStage(null)}>Hủy</button></section>}
    {actionError && <ErrorState error={actionError}/>}
    {bsc.plan_status === 'APPROVED' && (scoringLoading ? <LoadingState/> : scoringError ? <><ErrorState error={`${scoringError} Dữ liệu điểm cũ đã được xóa và không còn hiệu lực.`}/><button onClick={() => void loadScoring()}>Thử tải lại điểm</button></> : scoring && <BscScoreSummary preview={scoring}/>)}
    <BscItemTable bscId={bsc.id} items={items} scoring={scoring} canManage={canManage} canUpdateActual={canActual} onChange={reloadAll}/>
    {(permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY) || permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY)) && <section><h2>Lịch sử trạng thái</h2>{visibleHistory.length === 0 ? <EmptyState message="Chưa có thay đổi trạng thái."/> : <ol>{visibleHistory.map(history => <li key={history.id}><strong>{history.stage === 'PLAN' ? 'Nội dung' : 'Kết quả'}:</strong> <BscStatusBadge status={history.to_status}/> — {history.users.full_name}, {formatDate(history.changed_at)}{history.comment ? `: ${history.comment}` : ''}</li>)}</ol>}</section>}
  </main>;
};
