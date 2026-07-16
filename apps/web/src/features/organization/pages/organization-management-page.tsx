import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { useAuth } from '../../auth/hooks/use-auth';
import { API_BASE_URL } from '../../../lib/api-base-url';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, TableContainer } from '../management-ui';

type Tab = 'departments' | 'positions' | 'users';
type Item = { id: string; code?: string; employee_code?: string; name?: string; full_name?: string; email?: string; status: string };
const permissionFor: Record<Tab, string> = { departments: 'department.view', positions: 'position.view', users: 'user.view' };

/** Lightweight administrative lists. Mutating controls are separately permission-gated; API remains authoritative. */
export const OrganizationManagementPage: React.FC = () => {
  const { getAccessToken } = useAuth();
  const [tab, setTab] = useState<Tab>('departments');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null); setItems([]);
    void fetch(`${API_BASE_URL}/${tab}?limit=100`, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? 'Không thể tải dữ liệu.'); return response.json() as Promise<{ items: Item[] }>; })
      .then(data => setItems(data.items))
      .catch((reason: unknown) => { setItems([]); setError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu.'); })
      .finally(() => setLoading(false));
  }, [tab, getAccessToken, reload]);
  return <main>
    <PageHeader title="Quản lý tổ chức" description="Tổng quan đơn vị, chức danh và người dùng theo quyền được cấp." breadcrumb={<Link to="/">Trang chủ</Link>}/>
    <div role="tablist">{(Object.keys(permissionFor) as Tab[]).map(value => <PermissionGate key={value} permission={permissionFor[value]}><button type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'departments' ? 'Đơn vị' : value === 'positions' ? 'Chức danh' : 'Người dùng'}</button></PermissionGate>)}</div>
    <PermissionGate permission={tab === 'users' ? 'user.create' : tab === 'departments' ? 'department.manage' : 'position.manage'}><p>Chức năng tạo/chỉnh sửa được hiển thị theo quyền; mọi thay đổi vẫn được kiểm tra ở API.</p></PermissionGate>
    {loading ? <LoadingState/> : error ? <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/> : items.length === 0 ? <EmptyState message="Chưa có dữ liệu trong nhóm này."/> : <TableContainer label="Dữ liệu tổ chức"><table><thead><tr><th scope="col">Mã</th><th scope="col">Tên</th><th scope="col">Email</th><th scope="col">Trạng thái</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.code ?? item.employee_code}</td><td>{item.name ?? item.full_name}</td><td>{item.email ?? '—'}</td><td><StatusBadge status={item.status}/></td></tr>)}</tbody></table></TableContainer>}
  </main>;
};
