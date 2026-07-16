import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState, PageHeader, TableContainer } from '../../organization/management-ui';
import { rolesApi } from '../services/roles.service';
import type { RoleSummary } from '../types/roles.types';

const MODULE_LABEL: Record<string, string> = {
  bsc: 'BSC',
  user: 'Người dùng',
  department: 'Đơn vị',
  position: 'Chức danh',
  role: 'Vai trò',
  permission: 'Quyền',
  audit: 'Nhật ký',
};

export const RolesListPage: React.FC = () => {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRoles(await rolesApi.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách vai trò.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, reload]);

  return (
    <main className="space-y-5">
      <PageHeader
        title="Vai trò & Quyền"
        description="Xem và cấu hình quyền theo từng vai trò. Thay đổi được ghi nhận vào nhật ký hệ thống."
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
      ) : roles.length === 0 ? (
        <EmptyState message="Chưa có vai trò nào trong hệ thống." />
      ) : (
        <TableContainer label="Danh sách vai trò">
          <table>
            <thead>
              <tr>
                <th scope="col">Tên vai trò</th>
                <th scope="col">Mã</th>
                <th scope="col">Mô tả</th>
                <th scope="col">Số quyền</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <strong>{role.name}</strong>
                    {role.isSystem && <span className="status-badge status-info" style={{ marginLeft: '0.5rem' }}>Hệ thống</span>}
                  </td>
                  <td><code>{role.code}</code></td>
                  <td>{role.description ?? '—'}</td>
                  <td>{role.permissionCount}</td>
                  <td>
                    <span className={`status-badge status-${role.status.toLowerCase()}`}>
                      {role.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm dừng'}
                    </span>
                  </td>
                  <td>
                    <Link to={`/management/roles/${role.id}`}>Xem chi tiết</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableContainer>
      )}

      <p className="page-description" style={{ fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}>
        Module được quản lý: {Object.values(MODULE_LABEL).join(', ')}.
        Mọi thay đổi permission được ghi vào nhật ký hệ thống.
      </p>
    </main>
  );
};
