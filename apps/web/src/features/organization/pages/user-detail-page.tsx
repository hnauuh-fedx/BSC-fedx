import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { organizationApi, User } from '../organization-api';
import { ConfirmButton, ErrorState, FormField, LoadingState, PageHeader, StatusBadge } from '../management-ui';

export const UserDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const [user, setUser] = useState<User | null>(null), [error, setError] = useState(''), [success, setSuccess] = useState(''), [password, setPassword] = useState('');
  const load = useCallback(() => { organizationApi.user(id).then(setUser).catch(e => setError(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);
  const status = async (action: 'activate' | 'deactivate' | 'lock' | 'unlock') => { try { await organizationApi.userStatus(id, action); setSuccess('Đã cập nhật trạng thái người dùng.'); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể cập nhật trạng thái.'); } };
  const reset = async () => { if (password.length < 6) return setError('Mật khẩu mới phải có ít nhất 6 ký tự.'); try { await organizationApi.resetPassword(id, password); setPassword(''); setSuccess('Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập.'); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể đặt lại mật khẩu.'); } };
  if (!user && !error) return <LoadingState />;
  if (!user) return <ErrorState error={error} />;
  return <main><PageHeader title={user.full_name} /><p>{user.employee_code} · @{user.username} · {user.email}</p><p>Đơn vị: {user.departments?.name ?? '—'}</p><p>Chức danh: {user.positions?.name ?? '—'}</p><p>Quản lý: {user.users?.full_name ?? '—'}</p><StatusBadge status={user.status} />{error && <ErrorState error={error} />}{success && <p role="status">{success}</p>}<p><PermissionGate permission="user.update"><Link to={`/management/users/${user.id}/edit`}>Chỉnh sửa</Link></PermissionGate></p><PermissionGate permission="user.lock"><div>{user.status === 'ACTIVE' ? <><ConfirmButton message="Khóa người dùng?" onConfirm={() => void status('lock')}>Khóa</ConfirmButton> <ConfirmButton message="Ngừng hoạt động người dùng?" onConfirm={() => void status('deactivate')}>Ngừng hoạt động</ConfirmButton></> : <ConfirmButton message="Kích hoạt người dùng?" onConfirm={() => void status(user.status === 'LOCKED' ? 'unlock' : 'activate')}>Kích hoạt/Mở khóa</ConfirmButton>}</div></PermissionGate><PermissionGate permission="user.password.reset"><section><FormField label="Mật khẩu mới"><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></FormField><button onClick={() => void reset()}>Đặt lại mật khẩu</button></section></PermissionGate></main>;
};
