import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, FormField, LoadingState, PageHeader, Pagination, TableContainer } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscReopenRequest, BscVersionDetail } from '../types/employee-bsc.types';

type Stage = 'PLAN' | 'EVALUATION';
const LIMIT = 10;
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const stageLabel = (value: Stage) => value === 'PLAN' ? 'Kế hoạch' : 'Đánh giá kết quả';

export const BscReopenRequestsPage: React.FC = () => {
  const [stage, setStage] = useState<Stage>('PLAN'), [items, setItems] = useState<BscReopenRequest[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [actingId, setActingId] = useState(''), [selected, setSelected] = useState<BscReopenRequest | null>(null), [approving, setApproving] = useState<BscReopenRequest | null>(null);
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
    if (mutationPending.current) return;
    mutationPending.current = true; setActingId(item.id); setError('');
    try { await employeeBscApi.approveReopen(item.id); setSelected(null); setApproving(null); setReload(value => value + 1); }
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
    <main><PageHeader title="Yêu cầu mở lại BSC" description="Xem phiên bản đã duyệt và hệ quả trước khi cho phép chỉnh sửa lại." action={<Link to="/employee-bsc">Danh sách BSC</Link>}/>
      <div role="tablist" aria-label="Loại yêu cầu mở lại"><button role="tab" aria-selected={stage === 'PLAN'} onClick={() => switchStage('PLAN')}>Yêu cầu sửa kế hoạch</button><button role="tab" aria-selected={stage === 'EVALUATION'} onClick={() => switchStage('EVALUATION')}>Yêu cầu sửa kết quả</button></div>
      {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>}
      {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message="Không có yêu cầu mở lại đang chờ xử lý."/> : !error && <TableContainer label="Yêu cầu mở lại đang chờ"><table><thead><tr><th scope="col">Nhân viên</th><th scope="col">Đơn vị</th><th scope="col">Kỳ</th><th scope="col">Giai đoạn</th><th scope="col">Lý do</th><th scope="col">Người duyệt</th><th scope="col">Thời gian</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.employee_bsc.users_employee_bsc_employee_idTousers.full_name}</td><td>{item.employee_bsc.departments.name}</td><td>{item.employee_bsc.bsc_cycles.name}</td><td>{stageLabel(item.stage)}</td><td>{item.request_reason}</td><td>{item.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</td><td>{formatDate(item.requested_at)}</td><td><BscStatusBadge status={item.status}/></td><td><button disabled={Boolean(actingId)} onClick={() => void openDetail(item.id)}>Chi tiết</button> <button disabled={Boolean(actingId)} onClick={() => setApproving(item)}>{actingId === item.id ? 'Đang xử lý…' : 'Duyệt mở lại'}</button> <button disabled={Boolean(actingId)} onClick={() => { setRejecting(item); setReason(''); }}>Từ chối</button></td></tr>)}</tbody></table></TableContainer>}
      <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>{detailLoading && <LoadingState/>}
      <AccessibleDialog open={Boolean(selected) && !sourceVersion} title={`Chi tiết yêu cầu ${selected ? stageLabel(selected.stage) : ''}`} description="Kiểm tra lý do, BSC hiện tại và phiên bản nguồn trước khi quyết định." onClose={() => setSelected(null)} busy={Boolean(actingId)}><p>{selected?.request_reason}</p><p>Người duyệt: {selected?.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</p>{selected && <p><Link to={`/employee-bsc/${selected.employee_bsc_id}`}>Xem BSC hiện tại</Link></p>}<p>Phiên bản đã duyệt nguồn: {selected?.source_version_id ?? '—'} {selected?.source_version_id && <button onClick={() => void openSourceVersion(selected)}>Xem phiên bản nguồn</button>}</p><p>{selected?.stage === 'PLAN' ? 'Khi duyệt, dữ liệu đánh giá hiện tại sẽ được đặt lại.' : 'Khi duyệt, chỉ các trường kết quả được mở lại.'}</p><div className="dialog-actions">{selected && <button disabled={Boolean(actingId)} onClick={() => void approve(selected)}>{actingId ? 'Đang duyệt…' : 'Duyệt mở lại'}</button>} {selected && <button disabled={Boolean(actingId)} onClick={() => { setRejecting(selected); setSelected(null); setReason(''); }}>Từ chối</button>} <button disabled={Boolean(actingId)} onClick={() => setSelected(null)}>Đóng</button></div></AccessibleDialog>
      <AccessibleDialog open={Boolean(approving)} title={`Duyệt mở lại ${approving ? stageLabel(approving.stage) : ''}`} description={approving?.stage === 'PLAN' ? 'Định nghĩa KPI được mở lại và dữ liệu đánh giá hiện tại sẽ được đặt lại.' : 'Chỉ trường kết quả và thuyết minh kết quả được mở lại; định nghĩa KPI vẫn khóa.'} onClose={() => setApproving(null)} busy={Boolean(actingId)}><div className="dialog-actions"><button disabled={Boolean(actingId)} onClick={() => approving && void approve(approving)}>{actingId ? 'Đang duyệt…' : 'Xác nhận duyệt'}</button><button disabled={Boolean(actingId)} onClick={() => setApproving(null)}>Hủy</button></div></AccessibleDialog>
      <AccessibleDialog open={Boolean(sourceVersion)} title={`Phiên bản nguồn ${sourceVersion?.versionNumber ?? ''}`} description="Bản chụp dữ liệu tại thời điểm được duyệt." onClose={() => setSourceVersion(null)}><pre>{JSON.stringify(sourceVersion?.snapshot, null, 2)}</pre><button onClick={() => setSourceVersion(null)}>Đóng</button></AccessibleDialog>
      <AccessibleDialog open={Boolean(rejecting)} title="Từ chối yêu cầu mở lại" description="Yêu cầu sẽ bị từ chối và BSC tiếp tục ở trạng thái đã khóa." onClose={() => setRejecting(null)} busy={Boolean(actingId)}><FormField label="Lý do từ chối" error={!reason.trim() ? 'Vui lòng nhập lý do cụ thể.' : undefined}><textarea maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/></FormField><div className="dialog-actions"><button disabled={!reason.trim() || Boolean(actingId)} onClick={() => void reject()}>Xác nhận từ chối</button><button disabled={Boolean(actingId)} onClick={() => setRejecting(null)}>Hủy</button></div></AccessibleDialog>
    </main>
  </PermissionGate>;
};
