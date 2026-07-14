import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '../../../app/store/auth-store';
import { PermissionGate } from '../../auth/components/permission-gate';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../organization/management-ui';
import { BscItemTable } from '../components/bsc-item-table';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';

export const BscDetailPage: React.FC = () => {
  const { id = '' } = useParams(), navigate = useNavigate(), { state } = useAuthContext();
  const [bsc, setBsc] = useState<EmployeeBsc | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setBsc(await employeeBscApi.detail(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải BSC.'); } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <main><LoadingState/></main>;
  if (error) return <main><ErrorState error={error}/><button onClick={() => void load()}>Thử lại</button> <Link to="/employee-bsc">Quay lại</Link></main>;
  if (!bsc) return <main><EmptyState message="Không tìm thấy BSC."/></main>;
  const isDraft = bsc.status === 'DRAFT', isOwner = state.user?.id === bsc.employee_id, isManager = state.user?.id === bsc.direct_manager_id;
  const canManage = isDraft && isManager && Boolean(state.user?.permissions.includes(BSC_PERMISSIONS.MANAGE_KPI));
  const canActual = isDraft && isOwner && Boolean(state.user?.permissions.some(permission => permission === BSC_PERMISSIONS.EDIT_OWN || permission === BSC_PERMISSIONS.UPDATE_ACTUAL));
  const remove = async () => { if (!window.confirm('Xóa BSC nháp này?')) return; try { await employeeBscApi.delete(bsc.id); navigate('/employee-bsc'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xóa BSC.'); } };
  return <main><PageHeader title={bsc.bsc_code} action={<Link to="/employee-bsc">Danh sách</Link>}/><dl><dt>Nhân viên</dt><dd>{bsc.users_employee_bsc_employee_idTousers.full_name}</dd><dt>Kỳ</dt><dd>{bsc.bsc_cycles.name}</dd><dt>Đơn vị</dt><dd>{bsc.departments.name}</dd><dt>Trạng thái</dt><dd><BscStatusBadge status={bsc.status}/></dd><dt>Ghi chú</dt><dd>{bsc.employee_comment || '—'}</dd></dl>{isOwner && isDraft && <PermissionGate permission={BSC_PERMISSIONS.EDIT_OWN}><Link to={`/employee-bsc/${bsc.id}/edit`}>Sửa ghi chú</Link></PermissionGate>} {' '}{isOwner && isDraft && <PermissionGate permission={BSC_PERMISSIONS.DELETE_OWN}><button onClick={() => void remove()}>Xóa BSC</button></PermissionGate>}<BscItemTable bscId={bsc.id} items={bsc.employee_bsc_items ?? []} canManage={canManage} canUpdateActual={canActual} onChange={load}/></main>;
};
