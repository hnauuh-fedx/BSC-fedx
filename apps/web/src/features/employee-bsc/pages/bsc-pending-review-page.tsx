import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, FormField, LoadingState, PageHeader, Pagination, SearchInput, TableContainer } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';

type Stage = 'PLAN' | 'EVALUATION';
const LIMIT = 10;
const ALL_REVIEW = [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
  BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE];
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

export const BscPendingReviewPage: React.FC = () => {
  const { state } = useAuthContext(), permissions = state.user?.permissions ?? [];
  const [stage, setStage] = useState<Stage>('PLAN'), [items, setItems] = useState<EmployeeBsc[]>([]);
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]), [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState(''), [cycleId, setCycleId] = useState(''), [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [actingId, setActingId] = useState(''), [approving, setApproving] = useState<EmployeeBsc | null>(null), [returning, setReturning] = useState<EmployeeBsc | null>(null), [reason, setReason] = useState('');
  const loadGeneration = useRef(0);
  const approvePermission = stage === 'PLAN' ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE : BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE;
  const returnPermission = stage === 'PLAN' ? BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE;
  const allowed = permissions.includes(approvePermission) || permissions.includes(returnPermission);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true); setError(''); setItems([]); setTotal(0);
    if (!allowed) { setLoading(false); return; }
    try {
      const sortBy = stage === 'PLAN' ? 'plan_submitted_at' : 'evaluation_submitted_at';
      const result = await employeeBscApi.pendingReview({ stage, search, cycleId, departmentId, page, limit: LIMIT, sortBy, sortOrder: 'asc' });
      if (generation !== loadGeneration.current) return;
      setItems(result.items); setTotal(result.total);
      setCycles(result.filterOptions?.cycles ?? []); setDepartments(result.filterOptions?.departments ?? []);
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      setCycles([]); setDepartments([]);
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách chờ duyệt.');
    } finally { if (generation === loadGeneration.current) setLoading(false); }
  }, [allowed, stage, search, cycleId, departmentId, page]);
  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load, reload]);

  const approve = async (item: EmployeeBsc) => {
    setActingId(item.id); setError('');
    try {
      if (stage === 'PLAN') await employeeBscApi.approvePlan(item.id); else await employeeBscApi.approveEvaluation(item.id);
      setApproving(null); setReload(value => value + 1);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể duyệt BSC.'); }
    finally { setActingId(''); }
  };
  const returnBsc = async () => {
    if (!returning || !reason.trim()) return;
    setActingId(returning.id); setError('');
    try {
      if (stage === 'PLAN') await employeeBscApi.returnPlan(returning.id, reason); else await employeeBscApi.returnEvaluation(returning.id, reason);
      setReturning(null); setReason(''); setReload(value => value + 1);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể trả lại BSC.'); }
    finally { setActingId(''); }
  };
  const switchStage = (next: Stage) => { setStage(next); setPage(1); setApproving(null); setReturning(null); setReason(''); setError(''); };

  return <PermissionGate anyOf={ALL_REVIEW}>
    <main><PageHeader title="BSC chờ duyệt" description="Xử lý độc lập nội dung kế hoạch và kết quả tự đánh giá theo đúng thẩm quyền." action={<Link to="/employee-bsc">Danh sách BSC</Link>}/>
      <div role="tablist" aria-label="Giai đoạn duyệt"><button role="tab" aria-selected={stage === 'PLAN'} onClick={() => switchStage('PLAN')}>Chờ duyệt BSC</button><button role="tab" aria-selected={stage === 'EVALUATION'} onClick={() => switchStage('EVALUATION')}>Chờ duyệt kết quả</button></div>
      {!allowed ? <ErrorState error="Bạn không có quyền xử lý giai đoạn này."/> : <>
        <div className="filter-bar"><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
        <select aria-label="Kỳ BSC" value={cycleId} onChange={event => { setCycleId(event.target.value); setPage(1); }}><option value="">Tất cả kỳ</option>{cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select>
        <select aria-label="Đơn vị" value={departmentId} onChange={event => { setDepartmentId(event.target.value); setPage(1); }}><option value="">Tất cả đơn vị</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
        {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>}
        {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message={stage === 'PLAN' ? 'Không có BSC chờ duyệt nội dung.' : 'Không có BSC chờ duyệt kết quả.'}/> : !error && <TableContainer label="BSC chờ duyệt"><table><thead><tr><th scope="col">Mã BSC</th><th scope="col">Nhân viên</th><th scope="col">Kỳ</th><th scope="col">Đơn vị</th><th scope="col">Ngày nộp</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><Link to={`/employee-bsc/${item.id}`}>{item.bsc_code}</Link></td><td>{item.users_employee_bsc_employee_idTousers.full_name}</td><td>{item.bsc_cycles.name}</td><td>{item.departments.name}</td><td>{formatDate(stage === 'PLAN' ? item.plan_submitted_at : item.evaluation_submitted_at)}</td><td><BscStatusBadge status={stage === 'PLAN' ? item.plan_status : item.evaluation_status}/></td><td><PermissionGate permission={approvePermission}><button disabled={Boolean(actingId)} onClick={() => setApproving(item)}>{actingId === item.id ? 'Đang xử lý…' : 'Duyệt'}</button></PermissionGate> <PermissionGate permission={returnPermission}><button disabled={Boolean(actingId)} onClick={() => { setReturning(item); setReason(''); }}>Trả lại</button></PermissionGate></td></tr>)}</tbody></table></TableContainer>}
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
      </>}
      <AccessibleDialog open={Boolean(approving)} title={`Duyệt ${stage === 'PLAN' ? 'nội dung' : 'kết quả'} ${approving?.bsc_code ?? ''}`} description={stage === 'PLAN' ? 'Sau khi duyệt, định nghĩa KPI sẽ bị khóa và chủ sở hữu có thể nhập kết quả.' : 'Sau khi duyệt, điểm và xếp loại trở thành chính thức; toàn bộ BSC sẽ bị khóa.'} onClose={() => setApproving(null)} busy={Boolean(actingId)}><div className="dialog-actions"><button disabled={Boolean(actingId)} onClick={() => approving && void approve(approving)}>{actingId ? 'Đang duyệt…' : 'Xác nhận duyệt'}</button><button disabled={Boolean(actingId)} onClick={() => setApproving(null)}>Hủy</button></div></AccessibleDialog>
      <AccessibleDialog open={Boolean(returning)} title={`Trả lại ${stage === 'PLAN' ? 'nội dung' : 'kết quả'} ${returning?.bsc_code ?? ''}`} description="BSC sẽ được mở đúng nhóm trường của giai đoạn này để chủ sở hữu chỉnh sửa và nộp lại." onClose={() => setReturning(null)} busy={Boolean(actingId)}><FormField label="Lý do trả lại" error={!reason.trim() ? 'Vui lòng nhập lý do cụ thể.' : undefined}><textarea maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/></FormField><div className="dialog-actions"><button disabled={!reason.trim() || Boolean(actingId)} onClick={() => void returnBsc()}>{actingId ? 'Đang trả lại…' : 'Xác nhận trả lại'}</button><button disabled={Boolean(actingId)} onClick={() => setReturning(null)}>Hủy</button></div></AccessibleDialog>
    </main>
  </PermissionGate>;
};
