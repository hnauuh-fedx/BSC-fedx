import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';

export const BscListPage: React.FC = () => {
  const [items, setItems] = useState<EmployeeBsc[]>([]), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => { setLoading(true); setError(''); employeeBscApi.list({ search, status, page, limit: 20, sortBy: 'created_at', sortOrder: 'desc' }).then(result => { setItems(result.items); setTotal(result.total); }).catch(cause => setError(cause.message)).finally(() => setLoading(false)); }, [search, status, page, reload]);
  return <main><PageHeader title="BSC cá nhân" action={<PermissionGate permission={BSC_PERMISSIONS.CREATE_OWN}><Link to="/employee-bsc/new">Tạo BSC nháp</Link></PermissionGate>}/><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/><select aria-label="Trạng thái" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option><option value="DRAFT">Nháp</option></select>{loading ? <LoadingState/> : error ? <><ErrorState error={error}/><button onClick={() => setReload(value => value + 1)}>Thử lại</button></> : items.length === 0 ? <EmptyState message="Chưa có BSC trong phạm vi của bạn."/> : <table><thead><tr><th>Mã BSC</th><th>Nhân viên</th><th>Kỳ</th><th>Đơn vị</th><th>KPI</th><th>Trạng thái</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><Link to={`/employee-bsc/${item.id}`}>{item.bsc_code}</Link></td><td>{item.users_employee_bsc_employee_idTousers.full_name}</td><td>{item.bsc_cycles.name}</td><td>{item.departments.name}</td><td>{item._count?.employee_bsc_items ?? 0}</td><td><BscStatusBadge status={item.status}/></td></tr>)}</tbody></table>}<Pagination page={page} total={total} limit={20} onChange={setPage}/></main>;
};
