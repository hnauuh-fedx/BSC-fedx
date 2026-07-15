import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { PermissionGate } from '../../auth/components/permission-gate';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';

type Stage = 'PLAN' | 'EVALUATION';
const LIMIT = 20;
const ALL_REVIEW = [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
  BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE];
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

export const BscPendingReviewPage: React.FC = () => {
  const { state } = useAuthContext(), permissions = state.user?.permissions ?? [];
  const [stage, setStage] = useState<Stage>('PLAN'), [items, setItems] = useState<EmployeeBsc[]>([]);
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]), [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState(''), [cycleId, setCycleId] = useState(''), [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [actingId, setActingId] = useState(''), [returning, setReturning] = useState<EmployeeBsc | null>(null), [reason, setReason] = useState('');
  const approvePermission = stage === 'PLAN' ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE : BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE;
  const returnPermission = stage === 'PLAN' ? BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE;
  const allowed = permissions.includes(approvePermission) || permissions.includes(returnPermission);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setItems([]); setTotal(0);
    if (!allowed) { setLoading(false); return; }
    try {
      const sortBy = stage === 'PLAN' ? 'plan_submitted_at' : 'evaluation_submitted_at';
      const result = await employeeBscApi.pendingReview({ stage, search, cycleId, departmentId, page, limit: LIMIT, sortBy, sortOrder: 'asc' });
      setItems(result.items); setTotal(result.total);
      setCycles(result.filterOptions?.cycles ?? []); setDepartments(result.filterOptions?.departments ?? []);
    } catch (cause) {
      setCycles([]); setDepartments([]);
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách chờ duyệt.');
    } finally { setLoading(false); }
  }, [allowed, stage, search, cycleId, departmentId, page]);
  useEffect(() => { void load(); }, [load, reload]);

  const approve = async (item: EmployeeBsc) => {
    if (!window.confirm(stage === 'PLAN' ? `Duyệt nội dung ${item.bsc_code}?` : `Duyệt kết quả ${item.bsc_code}?`)) return;
    setActingId(item.id); setError('');
    try { if (stage === 'PLAN') await employeeBscApi.approvePlan(item.id); else await employeeBscApi.approveEvaluation(item.id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể duyệt BSC.'); }
    finally { setActingId(''); }
  };
  const returnBsc = async () => {
    if (!returning || !reason.trim()) return;
    setActingId(returning.id); setError('');
    try { if (stage === 'PLAN') await employeeBscApi.returnPlan(returning.id, reason); else await employeeBscApi.returnEvaluation(returning.id, reason); setReturning(null); setReason(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể trả lại BSC.'); }
    finally { setActingId(''); }
  };
  const switchStage = (next: Stage) => { setStage(next); setPage(1); setReturning(null); setReason(''); setError(''); };

  return <PermissionGate anyOf={ALL_REVIEW}>
    <main><PageHeader title="BSC chờ duyệt" action={<Link to="/employee-bsc">Danh sách BSC</Link>}/>
      <div role="tablist" aria-label="Giai đoạn duyệt"><button role="tab" aria-selected={stage === 'PLAN'} onClick={() => switchStage('PLAN')}>Chờ duyệt BSC</button><button role="tab" aria-selected={stage === 'EVALUATION'} onClick={() => switchStage('EVALUATION')}>Chờ duyệt kết quả</button></div>
      {!allowed ? <ErrorState error="Bạn không có quyền xử lý giai đoạn này."/> : <>
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
        <select aria-label="Kỳ BSC" value={cycleId} onChange={event => { setCycleId(event.target.value); setPage(1); }}><option value="">Tất cả kỳ</option>{cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select>
        <select aria-label="Đơn vị" value={departmentId} onChange={event => { setDepartmentId(event.target.value); setPage(1); }}><option value="">Tất cả đơn vị</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
        {error && <><ErrorState error={error}/><button onClick={() => setReload(value => value + 1)}>Thử lại</button></>}
        {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message={stage === 'PLAN' ? 'Không có BSC chờ duyệt nội dung.' : 'Không có BSC chờ duyệt kết quả.'}/> : !error && <table><thead><tr><th>Mã BSC</th><th>Nhân viên</th><th>Kỳ</th><th>Đơn vị</th><th>Ngày nộp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><Link to={`/employee-bsc/${item.id}`}>{item.bsc_code}</Link></td><td>{item.users_employee_bsc_employee_idTousers.full_name}</td><td>{item.bsc_cycles.name}</td><td>{item.departments.name}</td><td>{formatDate(stage === 'PLAN' ? item.plan_submitted_at : item.evaluation_submitted_at)}</td><td><BscStatusBadge status={stage === 'PLAN' ? item.plan_status : item.evaluation_status}/></td><td><PermissionGate permission={approvePermission}><button disabled={Boolean(actingId)} onClick={() => void approve(item)}>{actingId === item.id ? 'Đang xử lý…' : 'Duyệt'}</button></PermissionGate> <PermissionGate permission={returnPermission}><button disabled={Boolean(actingId)} onClick={() => { setReturning(item); setReason(''); }}>Trả lại</button></PermissionGate></td></tr>)}</tbody></table>}
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
      </>}
      {returning && <section role="dialog" aria-modal="true" aria-labelledby="pending-return-title"><h2 id="pending-return-title">Trả lại {stage === 'PLAN' ? 'nội dung' : 'kết quả'} {returning.bsc_code}</h2><label>Lý do<textarea autoFocus maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/></label><button disabled={!reason.trim() || Boolean(actingId)} onClick={() => void returnBsc()}>{actingId ? 'Đang trả lại…' : 'Xác nhận trả lại'}</button> <button disabled={Boolean(actingId)} onClick={() => setReturning(null)}>Hủy</button></section>}
    </main>
  </PermissionGate>;
};
