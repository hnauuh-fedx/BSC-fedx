import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../organization/management-ui';
import { rolesApi } from '../services/roles.service';
import type { PermissionGroup, RoleDetail } from '../types/roles.types';

// ─── Vietnamese permission module labels ──────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  auth: 'Xác thực',
  user: 'Người dùng',
  department: 'Đơn vị',
  position: 'Chức danh',
  role: 'Vai trò',
  permission: 'Quyền',
  bsc: 'BSC',
  audit: 'Nhật ký hệ thống',
  report: 'Báo cáo',
};

const PERMISSION_CODE_LABELS: Record<string, string> = {
  'user.view': 'Xem người dùng',
  'user.create': 'Tạo người dùng',
  'user.update': 'Cập nhật người dùng',
  'user.lock': 'Khóa người dùng',
  'user.password.reset': 'Đặt lại mật khẩu',
  'department.view': 'Xem đơn vị',
  'department.manage': 'Quản lý đơn vị',
  'position.view': 'Xem chức danh',
  'position.manage': 'Quản lý chức danh',
  'role.view': 'Xem vai trò',
  'role.manage': 'Quản lý vai trò',
  'permission.view': 'Xem quyền',
  'permission.assign': 'Gán quyền',
  'bsc.view.own': 'Xem BSC cá nhân',
  'bsc.create.own': 'Tạo BSC cá nhân',
  'bsc.edit.own': 'Sửa BSC cá nhân',
  'bsc.delete.own': 'Xóa BSC cá nhân nháp',
  'bsc.duplicate.own': 'Sao chép BSC',
  'bsc.submit.plan.own': 'Nộp giai đoạn kế hoạch',
  'bsc.submit.evaluation.own': 'Nộp giai đoạn đánh giá',
  'bsc.update.actual.own': 'Cập nhật kết quả thực hiện',
  'bsc.plan.approve.subordinate': 'Duyệt kế hoạch cấp dưới',
  'bsc.plan.return.subordinate': 'Trả lại kế hoạch cấp dưới',
  'bsc.evaluation.approve.subordinate': 'Duyệt đánh giá cấp dưới',
  'bsc.evaluation.return.subordinate': 'Trả lại đánh giá cấp dưới',
  'bsc.statistics.personal': 'Xem thống kê cá nhân',
  'bsc.statistics.unit': 'Xem thống kê đơn vị',
  'bsc.statistics.organization': 'Xem thống kê tổ chức',
  'bsc.period.view': 'Xem kỳ BSC',
  'bsc.period.manage': 'Quản lý kỳ BSC',
  'bsc.reopen.request': 'Yêu cầu mở lại BSC',
  'bsc.reopen.review': 'Xét duyệt mở lại BSC',
  'bsc.version.view': 'Xem lịch sử phiên bản',
  'audit.view': 'Xem nhật ký hệ thống',
};

function getPermissionLabel(code: string): string {
  return PERMISSION_CODE_LABELS[code] ?? code;
}

function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export const RoleDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [allPermissions, setAllPermissions] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [reload, setReload] = useState(0);

  // Set of currently selected permission IDs (local state for editing)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const originalIds = useRef<Set<string>>(new Set());
  const saveInFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setIsDirty(false);
    setSaveSuccess(false);
    try {
      const [roleData, allPerms] = await Promise.all([
        rolesApi.detail(id),
        rolesApi.allPermissions(),
      ]);
      setRole(roleData);
      setAllPermissions(allPerms);
      // Build initial selected IDs from the role's current permissions
      const ids = new Set(
        roleData.permissionsByModule.flatMap((group) =>
          group.permissions.map((p) => p.id),
        ),
      );
      setSelectedIds(ids);
      originalIds.current = new Set(ids);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết vai trò.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load, reload]);

  // Warn on navigation when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const togglePermission = (permId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(permId);
      else next.delete(permId);
      // Compare with original to determine dirty state
      const sameSize = next.size === originalIds.current.size;
      const sameContent = sameSize && [...next].every((id) => originalIds.current.has(id));
      setIsDirty(!sameContent);
      return next;
    });
    setSaveSuccess(false);
  };

  const save = async () => {
    if (!id || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const updated = await rolesApi.updatePermissions(id, [...selectedIds]);
      setRole(updated);
      const ids = new Set(
        updated.permissionsByModule.flatMap((group) =>
          group.permissions.map((p) => p.id),
        ),
      );
      setSelectedIds(ids);
      originalIds.current = new Set(ids);
      setIsDirty(false);
      setSaveSuccess(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Không thể lưu quyền.');
    } finally {
      setSaving(false);
      saveInFlight.current = false;
    }
  };

  if (loading) return <main><LoadingState /></main>;
  if (error) return (
    <main>
      <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
      <Link to="/management/roles">Quay lại danh sách vai trò</Link>
    </main>
  );
  if (!role) return <main><EmptyState message="Không tìm thấy vai trò." /></main>;

  return (
    <main className="space-y-5">
      <PageHeader
        title={role.name}
        description={role.description ?? `Vai trò ${role.code} — cấp ${role.hierarchyLevel}`}
        breadcrumb={<Link to="/management/roles">Vai trò & Quyền</Link>}
        action={
          <Button
            id="save-role-permissions"
            onClick={() => void save()}
            disabled={saving || !isDirty}
            aria-busy={saving}
          >
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        }
      />

      {isDirty && (
        <p role="status" style={{ color: 'var(--color-warning, #d97706)', fontWeight: 500 }}>
          ⚠ Có thay đổi chưa được lưu.
        </p>
      )}
      {saveSuccess && (
        <p role="status" style={{ color: 'var(--color-success, #16a34a)', fontWeight: 500 }}>
          ✓ Đã lưu quyền thành công. Thay đổi được ghi vào nhật ký hệ thống.
        </p>
      )}
      {saveError && (
        <p role="alert" style={{ color: 'var(--color-destructive, #dc2626)' }}>
          {saveError}
        </p>
      )}

      <section aria-labelledby="role-info-heading">
        <h2 id="role-info-heading">Thông tin vai trò</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.25rem 1rem' }}>
          <dt>Mã</dt><dd><code>{role.code}</code></dd>
          <dt>Cấp độ</dt><dd>{role.hierarchyLevel}</dd>
          <dt>Loại</dt><dd>{role.isSystem ? 'Hệ thống (không xóa được)' : 'Tùy chỉnh'}</dd>
          <dt>Trạng thái</dt><dd>{role.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm dừng'}</dd>
        </dl>
      </section>

      <section aria-labelledby="permissions-heading">
        <h2 id="permissions-heading">Quyền theo module</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}>
          Tích chọn permission để gán cho vai trò này. Bạn chỉ có thể gán permission mà tài khoản của bạn đang có.
        </p>

        {allPermissions.length === 0 ? (
          <EmptyState message="Chưa có permission nào trong hệ thống." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
            {allPermissions.map((group) => (
              <fieldset key={group.module} style={{ border: '1px solid var(--color-border)', borderRadius: '0.5rem', padding: '1rem' }}>
                <legend style={{ fontWeight: 600, padding: '0 0.5rem' }}>
                  {getModuleLabel(group.module)}
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {group.permissions.map((perm) => (
                    <label
                      key={perm.id}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        id={`perm-${perm.id}`}
                        checked={selectedIds.has(perm.id)}
                        onChange={(e) => togglePermission(perm.id, e.target.checked)}
                        disabled={saving}
                        style={{ marginTop: '0.2rem', flexShrink: 0 }}
                      />
                      <span>
                        <span style={{ fontWeight: 500 }}>{getPermissionLabel(perm.code)}</span>
                        {perm.description && (
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>
                            {perm.description}
                          </span>
                        )}
                        <code style={{ fontSize: '0.7rem', color: 'var(--color-muted-foreground)' }}>{perm.code}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem' }}>
        <Button
          id="save-role-permissions-bottom"
          onClick={() => void save()}
          disabled={saving || !isDirty}
          aria-busy={saving}
        >
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
        <Link to="/management/roles">
          <Button variant="outline" type="button">Quay lại</Button>
        </Link>
      </div>
    </main>
  );
};
