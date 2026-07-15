import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscReopenRequest, BscVersionDetail } from '../types/employee-bsc.types';

type Stage = 'PLAN' | 'EVALUATION';
const LIMIT = 10;
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

export const BscReopenRequestsPage: React.FC = () => {
  const [stage, setStage] = useState<Stage>('PLAN'), [items, setItems] = useState<BscReopenRequest[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [actingId, setActingId] = useState(''), [selected, setSelected] = useState<BscReopenRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false), [rejecting, setRejecting] = useState<BscReopenRequest | null>(null), [reason, setReason] = useState('');
  const [sourceVersion, setSourceVersion] = useState<BscVersionDetail | null>(null);
  const generation = useRef(0), mutationPending = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError(''); setItems([]); setTotal(0);
    try {
      const result = await employeeBscApi.pendingReopenRequests({ stage, page, limit: LIMIT });
      if (current !== generation.current) return;
      setItems(result.items); setTotal(result.total);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Không thể tải yêu cầu mở lại.');
    } finally { if (current === generation.current) setLoading(false); }
  }, [stage, page]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load, reload]);
  const openDetail = async (requestId: string) => {
    setDetailLoading(true); setError('');
    try { setSelected(await employeeBscApi.reopenRequest(requestId)); }
    catch (cause) { setSelected(null); setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết yêu cầu.'); }
    finally { setDetailLoading(false); }
  };
  const approve = async (item: BscReopenRequest) => {
    if (mutationPending.current || !window.confirm(`Duyệt yêu cầu mở lại ${item.stage}?`)) return;
    mutationPending.current = true; setActingId(item.id); setError('');
    try { await employeeBscApi.approveReopen(item.id); setSelected(null); setReload(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể duyệt yêu cầu.'); }
    finally { mutationPending.current = false; setActingId(''); }
  };
  const openSourceVersion = async (item: BscReopenRequest) => {
    if (!item.source_version_id) return;
    setDetailLoading(true); setError('');
    try { setSourceVersion(await employeeBscApi.version(item.employee_bsc_id, item.source_version_id)); }
    catch (cause) { setSourceVersion(null); setError(cause instanceof Error ? cause.message : 'Không thể tải phiên bản nguồn.'); }
    finally { setDetailLoading(false); }
  };
  const reject = async () => {
    if (!rejecting || !reason.trim() || mutationPending.current) return;
    mutationPending.current = true; setActingId(rejecting.id); setError('');
    try { await employeeBscApi.rejectReopen(rejecting.id, reason); setRejecting(null); setSelected(null); setReason(''); setReload(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể từ chối yêu cầu.'); }
    finally { mutationPending.current = false; setActingId(''); }
  };
  const switchStage = (value: Stage) => { setStage(value); setPage(1); setSelected(null); setRejecting(null); setError(''); };

  return <PermissionGate permission={BSC_PERMISSIONS.REVIEW_REOPEN}>
    <main><PageHeader title="Yêu cầu mở lại BSC" action={<Link to="/employee-bsc">Danh sách BSC</Link>}/>
      <div role="tablist" aria-label="Loại yêu cầu mở lại"><button role="tab" aria-selected={stage === 'PLAN'} onClick={() => switchStage('PLAN')}>Yêu cầu sửa kế hoạch</button><button role="tab" aria-selected={stage === 'EVALUATION'} onClick={() => switchStage('EVALUATION')}>Yêu cầu sửa kết quả</button></div>
      {error && <><ErrorState error={error}/><button onClick={() => setReload(value => value + 1)}>Thử lại</button></>}
      {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message="Không có yêu cầu mở lại đang chờ xử lý."/> : !error && <table><thead><tr><th>Nhân viên</th><th>Đơn vị</th><th>Kỳ</th><th>Stage</th><th>Lý do</th><th>Người duyệt</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.employee_bsc.users_employee_bsc_employee_idTousers.full_name}</td><td>{item.employee_bsc.departments.name}</td><td>{item.employee_bsc.bsc_cycles.name}</td><td>{item.stage}</td><td>{item.request_reason}</td><td>{item.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</td><td>{formatDate(item.requested_at)}</td><td><BscStatusBadge status={item.status}/></td><td><button disabled={Boolean(actingId)} onClick={() => void openDetail(item.id)}>Chi tiết</button> <button disabled={Boolean(actingId)} onClick={() => void approve(item)}>{actingId === item.id ? 'Đang xử lý…' : 'Duyệt mở lại'}</button> <button disabled={Boolean(actingId)} onClick={() => { setRejecting(item); setReason(''); }}>Từ chối</button></td></tr>)}</tbody></table>}
      <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>{detailLoading && <LoadingState/>}
      {selected && <section role="dialog" aria-modal="true"><h2>Chi tiết yêu cầu {selected.stage}</h2><p>{selected.request_reason}</p><p>Người duyệt: {selected.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</p><p><Link to={`/employee-bsc/${selected.employee_bsc_id}`}>Xem BSC hiện tại</Link></p><p>Phiên bản đã duyệt nguồn: {selected.source_version_id ?? '—'} {selected.source_version_id && <button onClick={() => void openSourceVersion(selected)}>Xem phiên bản nguồn</button>}</p><p>{selected.stage === 'PLAN' ? 'Dữ liệu đánh giá active sẽ bị đặt lại khi duyệt.' : 'Chỉ trường kết quả được mở lại.'}</p><button onClick={() => void approve(selected)}>Duyệt mở lại</button> <button onClick={() => { setRejecting(selected); setReason(''); }}>Từ chối</button> <button onClick={() => setSelected(null)}>Đóng</button></section>}
      {sourceVersion && <section role="dialog" aria-modal="true"><h2>Phiên bản nguồn {sourceVersion.versionNumber}</h2><p>{sourceVersion.stage} — {sourceVersion.versionType}</p><pre>{JSON.stringify(sourceVersion.snapshot, null, 2)}</pre><button onClick={() => setSourceVersion(null)}>Đóng</button></section>}
      {rejecting && <section role="dialog" aria-modal="true"><h2>Từ chối yêu cầu mở lại</h2><label>Lý do từ chối<textarea aria-label="Lý do từ chối" autoFocus maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/></label><button disabled={!reason.trim() || Boolean(actingId)} onClick={() => void reject()}>Xác nhận từ chối</button> <button disabled={Boolean(actingId)} onClick={() => setRejecting(null)}>Hủy</button></section>}
    </main>
  </PermissionGate>;
};
