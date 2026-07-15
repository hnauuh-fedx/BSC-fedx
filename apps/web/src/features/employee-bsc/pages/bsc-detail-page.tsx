import React, { useCallback, useEffect, useState } from 'react';
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

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

export const BscDetailPage: React.FC = () => {
  const { id = '' } = useParams(), navigate = useNavigate(), { state } = useAuthContext();
  const [bsc, setBsc] = useState<EmployeeBsc | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [scoring, setScoring] = useState<BscScoringPreview | null>(null), [scoringLoading, setScoringLoading] = useState(true), [scoringError, setScoringError] = useState('');
  const [action, setAction] = useState<'submit' | 'approve' | 'return' | null>(null), [actionError, setActionError] = useState('');
  const [showReturn, setShowReturn] = useState(false), [returnReason, setReturnReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setBsc(await employeeBscApi.detail(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải BSC.'); }
    finally { setLoading(false); }
  }, [id]);
  const loadScoring = useCallback(async () => {
    setScoringLoading(true); setScoringError(''); setScoring(null);
    try { setScoring(await employeeBscApi.scoringPreview(id)); }
    catch (cause) { setScoringError(cause instanceof Error ? cause.message : 'Không thể tải điểm tạm tính.'); }
    finally { setScoringLoading(false); }
  }, [id]);
  const reloadAll = useCallback(async () => { await Promise.all([load(), loadScoring()]); }, [load, loadScoring]);
  useEffect(() => { void reloadAll(); }, [reloadAll]);

  const runAction = async (kind: 'submit' | 'approve' | 'return') => {
    if (kind === 'submit' && !window.confirm('Nộp BSC cho quản lý trực tiếp? Sau khi nộp, dữ liệu sẽ bị khóa.')) return;
    if (kind === 'approve' && !window.confirm('Duyệt BSC này với điểm do hệ thống tính?')) return;
    if (kind === 'return' && !returnReason.trim()) { setActionError('Vui lòng nhập lý do trả lại.'); return; }
    setAction(kind); setActionError('');
    try {
      if (kind === 'submit') await employeeBscApi.submit(id);
      else if (kind === 'approve') await employeeBscApi.approve(id);
      else await employeeBscApi.return(id, returnReason);
      setShowReturn(false); setReturnReason(''); await reloadAll();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xử lý BSC.'); }
    finally { setAction(null); }
  };

  if (loading) return <main><LoadingState/></main>;
  if (error) return <main><ErrorState error={error}/><button onClick={() => void reloadAll()}>Thử lại</button> <Link to="/employee-bsc">Quay lại</Link></main>;
  if (!bsc) return <main><EmptyState message="Không tìm thấy BSC."/></main>;

  const editable = bsc.status === 'DRAFT' || bsc.status === 'RETURNED';
  const isOwner = state.user?.id === bsc.employee_id, isManager = state.user?.id === bsc.direct_manager_id;
  const canManage = editable && isManager && Boolean(state.user?.permissions.includes(BSC_PERMISSIONS.MANAGE_KPI));
  const canActual = editable && isOwner && Boolean(state.user?.permissions.some((permission) => permission === BSC_PERMISSIONS.EDIT_OWN || permission === BSC_PERMISSIONS.UPDATE_ACTUAL));
  const canSubmit = editable && isOwner && Boolean(state.user?.permissions.includes(BSC_PERMISSIONS.SUBMIT_OWN));
  const canApprove = bsc.status === 'SUBMITTED' && isManager && Boolean(state.user?.permissions.includes(BSC_PERMISSIONS.APPROVE_SUBORDINATE));
  const canReturn = bsc.status === 'SUBMITTED' && isManager && Boolean(state.user?.permissions.includes(BSC_PERMISSIONS.RETURN_SUBORDINATE));
  const lastReturn = [...(bsc.bsc_status_histories ?? [])].reverse().find(history => history.action === 'RETURN');
  const submissionIssues = !scoring ? [] : [
    ...(scoring.items.length === 0 ? ['BSC chưa có KPI.'] : []),
    ...(scoring.totalWeight !== 100 ? [`Tổng trọng số hiện tại là ${scoring.totalWeight}%, cần đúng 100%.`] : []),
    ...scoring.items.filter(item => !item.isScorable).map(item => {
      const code = bsc.employee_bsc_items?.find(kpi => kpi.id === item.itemId)?.kpi_code ?? item.itemId;
      return item.reason === 'ACTUAL_NOT_PROVIDED' ? `${code}: chưa nhập kết quả.` : `${code}: dữ liệu hiện tại chưa tính điểm được.`;
    }),
  ];
  const remove = async () => {
    if (!window.confirm('Xóa BSC nháp này?')) return;
    try { await employeeBscApi.delete(bsc.id); navigate('/employee-bsc'); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể xóa BSC.'); }
  };

  return <main>
    <PageHeader title={bsc.bsc_code} action={<Link to="/employee-bsc">Danh sách</Link>}/>
    {bsc.status === 'RETURNED' && lastReturn && <section role="alert"><h2>BSC đã bị trả lại</h2><p>{lastReturn.comment}</p><p>Bởi {lastReturn.users.full_name}, {formatDate(lastReturn.changed_at)}</p></section>}
    <dl>
      <dt>Nhân viên</dt><dd>{bsc.users_employee_bsc_employee_idTousers.full_name}</dd>
      <dt>Kỳ</dt><dd>{bsc.bsc_cycles.name}</dd><dt>Đơn vị</dt><dd>{bsc.departments.name}</dd>
      <dt>Trạng thái</dt><dd><BscStatusBadge status={bsc.status}/></dd>
      <dt>Quản lý trực tiếp</dt><dd>{bsc.users_employee_bsc_direct_manager_idTousers?.full_name ?? '—'}</dd>
      <dt>Ngày nộp</dt><dd>{formatDate(bsc.submitted_at)}</dd><dt>Ngày duyệt</dt><dd>{formatDate(bsc.approved_at)}</dd>
      {bsc.status === 'APPROVED' && <><dt>Điểm chính thức</dt><dd>{bsc.final_score ?? '—'}</dd><dt>Xếp loại</dt><dd>{bsc.final_grade ?? '—'}</dd></>}
      <dt>Ghi chú</dt><dd>{bsc.employee_comment || '—'}</dd>
    </dl>
    {isOwner && editable && <PermissionGate permission={BSC_PERMISSIONS.EDIT_OWN}><Link to={`/employee-bsc/${bsc.id}/edit`}>Sửa ghi chú</Link></PermissionGate>} {' '}
    {isOwner && bsc.status === 'DRAFT' && <PermissionGate permission={BSC_PERMISSIONS.DELETE_OWN}><button onClick={() => void remove()}>Xóa BSC</button></PermissionGate>} {' '}
    {canSubmit && <PermissionGate permission={BSC_PERMISSIONS.SUBMIT_OWN}><button disabled={action !== null || !scoring?.isComplete} title={!scoring?.isComplete ? 'Hoàn thiện KPI, kết quả và tổng trọng số 100% trước khi nộp.' : undefined} onClick={() => void runAction('submit')}>{action === 'submit' ? 'Đang nộp…' : bsc.status === 'RETURNED' ? 'Nộp lại' : 'Nộp BSC'}</button></PermissionGate>} {' '}
    {canApprove && <PermissionGate permission={BSC_PERMISSIONS.APPROVE_SUBORDINATE}><button disabled={action !== null} onClick={() => void runAction('approve')}>{action === 'approve' ? 'Đang duyệt…' : 'Duyệt'}</button></PermissionGate>} {' '}
    {canReturn && <PermissionGate permission={BSC_PERMISSIONS.RETURN_SUBORDINATE}><button disabled={action !== null} onClick={() => setShowReturn(true)}>Trả lại</button></PermissionGate>}
    {canSubmit && submissionIssues.length > 0 && <section role="alert"><h2>Chưa thể nộp BSC</h2><ul>{submissionIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></section>}
    {showReturn && <section role="dialog" aria-modal="true" aria-labelledby="return-title"><h2 id="return-title">Trả lại BSC</h2><label>Lý do<textarea maxLength={2000} rows={5} value={returnReason} onChange={event => setReturnReason(event.target.value)} autoFocus/></label><button disabled={action !== null || !returnReason.trim()} onClick={() => void runAction('return')}>{action === 'return' ? 'Đang trả lại…' : 'Xác nhận trả lại'}</button> <button disabled={action !== null} onClick={() => { setShowReturn(false); setActionError(''); }}>Hủy</button></section>}
    {actionError && <ErrorState error={actionError}/>}
    {scoringLoading ? <LoadingState/> : scoringError ? <><ErrorState error={scoringError}/><button onClick={() => void loadScoring()}>Thử tải lại điểm</button></> : scoring && <BscScoreSummary preview={scoring}/>}
    <BscItemTable bscId={bsc.id} items={bsc.employee_bsc_items ?? []} scoring={scoring} canManage={canManage} canUpdateActual={canActual} onChange={reloadAll}/>
    <section><h2>Lịch sử trạng thái</h2>{(bsc.bsc_status_histories?.length ?? 0) === 0 ? <EmptyState message="Chưa có thay đổi trạng thái."/> : <ol>{bsc.bsc_status_histories?.map(history => <li key={history.id}><BscStatusBadge status={history.to_status}/> — {history.users.full_name}, {formatDate(history.changed_at)}{history.comment ? `: ${history.comment}` : ''}</li>)}</ol>}</section>
  </main>;
};
