import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { useAuth } from '../../auth/hooks/use-auth';

type Tab = 'departments' | 'positions' | 'users';
type Item = { id: string; code?: string; employee_code?: string; name?: string; full_name?: string; email?: string; status: string };
const permissionFor: Record<Tab, string> = { departments: 'department.view', positions: 'position.view', users: 'user.view' };

/** Lightweight administrative lists. Mutating controls are separately permission-gated; API remains authoritative. */
export const OrganizationManagementPage: React.FC = () => {
  const { getAccessToken } = useAuth();
  const [tab, setTab] = useState<Tab>('departments');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    void fetch(`/api/${tab}?limit=100`, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? 'Không thể tải dữ liệu.'); return response.json() as Promise<{ items: Item[] }>; })
      .then(data => setItems(data.items))
      .catch((reason: unknown) => { setItems([]); setError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu.'); });
  }, [tab, getAccessToken]);
  return <main style={{ padding: 32 }}>
    <nav><Link to="/">Trang chủ</Link></nav>
    <h1>Quản lý tổ chức</h1>
    <div role="tablist">{(Object.keys(permissionFor) as Tab[]).map(value => <PermissionGate key={value} permission={permissionFor[value]}><button type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'departments' ? 'Đơn vị' : value === 'positions' ? 'Chức danh' : 'Người dùng'}</button></PermissionGate>)}</div>
    <PermissionGate permission={tab === 'users' ? 'user.create' : tab === 'departments' ? 'department.manage' : 'position.manage'}><p>Chức năng tạo/chỉnh sửa được hiển thị theo quyền; mọi thay đổi vẫn được kiểm tra ở API.</p></PermissionGate>
    {error ? <p role="alert">{error}</p> : <table><thead><tr><th>Mã</th><th>Tên</th><th>Email</th><th>Trạng thái</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.code ?? item.employee_code}</td><td>{item.name ?? item.full_name}</td><td>{item.email ?? ''}</td><td>{item.status}</td></tr>)}</tbody></table>}
  </main>;
};
