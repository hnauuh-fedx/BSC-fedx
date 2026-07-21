import React, { useEffect, useState } from 'react';
import { CopyIcon, EyeIcon, FileSpreadsheetIcon, PrinterIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { PermissionGate } from '../../auth/components/permission-gate';
import {
  AccessibleDialog,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  TableContainer,
} from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscDuplicateOptions, EmployeeBsc } from '../types/employee-bsc.types';
import { downloadBrowserFile } from '../utils/download-browser-file';

const REVIEW_PERMISSIONS = [
  BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
  BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
  BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE,
  BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE,
];

export const BscListPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<EmployeeBsc[]>([]), [search, setSearch] = useState('');
  const [planStatus, setPlanStatus] = useState(''), [evaluationStatus, setEvaluationStatus] = useState('');
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [reload, setReload] = useState(0), [exportingId, setExportingId] = useState('');
  const [duplicateSource, setDuplicateSource] = useState<EmployeeBsc | null>(null);
  const [duplicateOptions, setDuplicateOptions] = useState<BscDuplicateOptions | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false), [duplicateError, setDuplicateError] = useState('');
  const [targetCycleId, setTargetCycleId] = useState(''), [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setItems([]);
    employeeBscApi.list({ scope: 'OWN', search, planStatus, evaluationStatus, page, limit: 20, sortBy: 'created_at', sortOrder: 'desc' })
      .then(result => { setItems(result.items); setTotal(result.total); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách BSC.'))
      .finally(() => setLoading(false));
  }, [search, planStatus, evaluationStatus, page, reload]);

  const exportExcel = async (item: EmployeeBsc) => {
    setExportingId(item.id);
    setError('');
    try {
      downloadBrowserFile(await employeeBscApi.exportExcel(item.employee_id, item.cycle_id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xuất Excel.');
    } finally {
      setExportingId('');
    }
  };

  const openPrint = (id: string) => {
    window.open(`/employee-bsc/${id}?print=1`, '_blank', 'noopener,noreferrer');
  };

  const openDuplicate = async (item: EmployeeBsc) => {
    setDuplicateSource(item);
    setDuplicateLoading(true);
    setDuplicateError('');
    setDuplicateOptions(null);
    try {
      const options = await employeeBscApi.duplicateOptions(item.id);
      setDuplicateOptions(options);
      setTargetCycleId(options.suggestedCycleId ?? '');
    } catch (cause) {
      setDuplicateError(cause instanceof Error ? cause.message : 'Không thể tải kỳ đích để sao chép.');
    } finally {
      setDuplicateLoading(false);
    }
  };

  const closeDuplicate = () => {
    if (duplicating) return;
    setDuplicateSource(null);
    setDuplicateOptions(null);
    setDuplicateError('');
    setTargetCycleId('');
  };

  const duplicate = async () => {
    if (!duplicateSource || !targetCycleId) return;
    setDuplicating(true);
    setDuplicateError('');
    try {
      const created = await employeeBscApi.duplicate(duplicateSource.id, targetCycleId);
      setDuplicateSource(null);
      setDuplicateOptions(null);
      navigate(`/employee-bsc/${created.id}`);
    } catch (cause) {
      setDuplicateError(cause instanceof Error ? cause.message : 'Không thể sao chép BSC.');
    } finally {
      setDuplicating(false);
    }
  };

  return <main>
    <PageHeader title="BSC cá nhân" description="Theo dõi riêng trạng thái kế hoạch và đánh giá kết quả của từng kỳ." action={<>
      <PermissionGate anyOf={REVIEW_PERMISSIONS}><Link to="/management/bsc-reviews">BSC chờ duyệt</Link>{' '}</PermissionGate>
      <PermissionGate permission={BSC_PERMISSIONS.REVIEW_REOPEN}><Link to="/management/bsc-reopen-requests">Yêu cầu mở lại</Link>{' '}</PermissionGate>
      <PermissionGate permission={BSC_PERMISSIONS.CREATE_OWN}><Link to="/employee-bsc/new">Tạo BSC nháp</Link></PermissionGate>
    </>}/>
    <div className="filter-bar"><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
      <select aria-label="Duyệt nội dung BSC" value={planStatus} onChange={event => { setPlanStatus(event.target.value); setPage(1); }}>
        <option value="">Tất cả kế hoạch</option><option value="DRAFT">Nháp</option><option value="SUBMITTED">Chờ duyệt</option><option value="RETURNED">Bị trả lại</option><option value="APPROVED">Đã duyệt</option>
      </select>
    </div>
    <select aria-label="Đánh giá kết quả" value={evaluationStatus} onChange={event => { setEvaluationStatus(event.target.value); setPage(1); }}>
      <option value="">Tất cả đánh giá</option><option value="NOT_STARTED">Chưa bắt đầu</option><option value="DRAFT">Đang tự đánh giá</option><option value="SUBMITTED">Chờ duyệt kết quả</option><option value="RETURNED">Bị trả lại</option><option value="APPROVED">Đã duyệt</option>
    </select>
    {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>}
    {loading ? <LoadingState/> : !error && items.length === 0 ? <EmptyState message="Chưa có BSC cá nhân."/> : !error &&
      <TableContainer label="Danh sách BSC cá nhân"><table><thead><tr><th scope="col">Kỳ</th><th scope="col">Đơn vị</th><th scope="col">Duyệt nội dung BSC</th><th scope="col">Đánh giá kết quả</th><th scope="col">Điểm chính thức</th><th scope="col">Xếp loại chính thức</th><th scope="col">Thao tác</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}><td>{item.bsc_cycles.name}</td><td>{item.departments.name}</td><td><BscStatusBadge status={item.plan_status}/></td><td><BscStatusBadge status={item.evaluation_status}/></td><td>{item.evaluation_status === 'APPROVED' ? item.final_score ?? '—' : '—'}</td><td>{item.evaluation_status === 'APPROVED' ? item.final_grade ?? '—' : '—'}</td><td>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <Button asChild variant="outline" size="icon-sm"><Link to={`/employee-bsc/${item.id}`} aria-label="Xem chi tiết" title="Xem chi tiết"><EyeIcon data-icon="inline-start"/></Link></Button>
            <PermissionGate permission={BSC_PERMISSIONS.EXPORT}>
              <Button variant="outline" size="icon-sm" aria-label="Xuất Excel" title="Xuất Excel" disabled={exportingId === item.id} onClick={() => void exportExcel(item)}><FileSpreadsheetIcon data-icon="inline-start"/></Button>
            </PermissionGate>
            <Button variant="outline" size="icon-sm" aria-label="In BSC" title="In BSC" onClick={() => openPrint(item.id)}><PrinterIcon data-icon="inline-start"/></Button>
            <PermissionGate permission={BSC_PERMISSIONS.DUPLICATE_OWN}>
              <Button variant="outline" size="icon-sm" aria-label="Sao chép BSC" title="Sao chép BSC" onClick={() => void openDuplicate(item)}><CopyIcon data-icon="inline-start"/></Button>
            </PermissionGate>
          </div>
        </td></tr>)}</tbody></table></TableContainer>}
    <Pagination page={page} total={total} limit={20} onChange={setPage}/>
    <AccessibleDialog open={Boolean(duplicateSource)} title="Sao chép BSC" description="BSC mới lấy dữ liệu từ phiên bản 1. Nếu chưa có phiên bản 1, hệ thống sẽ tạo một BSC trắng." onClose={closeDuplicate} busy={duplicating}>
      {duplicateLoading ? <LoadingState/> : <>
        {duplicateError && <ErrorState error={duplicateError}/>}
        {duplicateOptions && <>
          <p>{duplicateOptions.sourceVersion
            ? `BSC nguồn có dữ liệu: phiên bản ${duplicateOptions.sourceVersion.versionNumber} · ${duplicateOptions.sourceVersion.summary.itemCount} KPI · tổng tỷ trọng ${String(duplicateOptions.sourceVersion.summary.totalWeight ?? '—')}%.`
            : 'BSC nguồn chưa có phiên bản 1; BSC mới sẽ để trống.'}</p>
          {duplicateOptions.cycles.length === 0
            ? <p role="status">Chưa có kỳ tháng nào sau {duplicateSource?.bsc_cycles.name ?? 'kỳ nguồn'} đang mở và chưa có BSC của bạn. Hãy nhờ quản trị viên tạo hoặc mở kỳ tiếp theo rồi thử lại.</p>
            : <FormField label="Kỳ đích"><select value={targetCycleId} onChange={event => setTargetCycleId(event.target.value)}>{duplicateOptions.cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></FormField>}
          <div className="dialog-actions">{duplicateOptions.cycles.length > 0 && <Button disabled={!targetCycleId || duplicating} onClick={() => void duplicate()}>{duplicating ? 'Đang sao chép…' : 'Xác nhận sao chép'}</Button>}<Button variant="outline" onClick={closeDuplicate}>Hủy</Button></div>
        </>}
      </>}
    </AccessibleDialog>
  </main>;
};
