import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ROLE_UI_PERMISSIONS } from '../../features/auth/landing';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { ADMINISTRATION_PERMISSIONS, hasAnyPermission } from '../../features/organization/administration-navigation';

const REPORT_PERMISSIONS = ['bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization'];
const CYCLE_PERMISSIONS = ['bsc.period.view', 'bsc.period.manage'];
const ROLE_PERMISSIONS = ['role.view', 'role.manage'];
const AUDIT_PERMISSIONS = ['audit.view'];

export const MainLayout: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, logout } = useAuth();
  const permissions = user?.permissions ?? [];
  const canReport = permissions.some((permission) => REPORT_PERMISSIONS.includes(permission));
  const canViewOwnBsc = permissions.some((permission) => ROLE_UI_PERMISSIONS.OWN_BSC_PERMISSIONS.includes(permission));
  const canReview = permissions.some((permission) => ROLE_UI_PERMISSIONS.REVIEW_PERMISSIONS.includes(permission));
  const canViewManagementOverview = permissions.some((permission) => ROLE_UI_PERMISSIONS.MANAGEMENT_DASHBOARD_PERMISSIONS.includes(permission));
  const canAdminister = hasAnyPermission(permissions, ADMINISTRATION_PERMISSIONS);
  const canManageCycles = permissions.some((permission) => CYCLE_PERMISSIONS.includes(permission));
  const canManageRoles = permissions.some((permission) => ROLE_PERMISSIONS.includes(permission));
  const canViewAudit = permissions.some((permission) => AUDIT_PERMISSIONS.includes(permission));
  const linkClass = ({ isActive }: { isActive: boolean }) => isActive ? 'nav-link nav-link-active' : 'nav-link';

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
    <header className="app-header"><div className="app-header-inner">
      <NavLink to="/" className="brand">BSC Management</NavLink>
      <nav className="app-nav" aria-label="Điều hướng chính">
        {canViewOwnBsc && <NavLink className={linkClass} to="/employee-bsc">BSC cá nhân</NavLink>}
        {canViewManagementOverview && <NavLink className={linkClass} to="/dashboard">Tổng quan đơn vị</NavLink>}
        {canViewManagementOverview && <NavLink className={linkClass} to="/management/bsc-overview">Quản lý BSC</NavLink>}
        {canReport && <NavLink className={linkClass} to="/reports/bsc">Báo cáo</NavLink>}
        {canReview && <NavLink className={linkClass} to="/management/bsc-reviews">Chờ duyệt</NavLink>}
        {canManageCycles && <NavLink className={linkClass} to="/management/bsc-cycles">Kỳ BSC</NavLink>}
        {canManageRoles && <NavLink className={linkClass} to="/management/roles">Vai trò & Quyền</NavLink>}
        {canViewAudit && <NavLink className={linkClass} to="/management/audit-logs">Nhật ký</NavLink>}
        {canAdminister && <NavLink className={linkClass} to="/management">Quản trị</NavLink>}
      </nav>
      <div className="user-menu"><span title={user?.email}>{user?.fullName}</span><Button variant="outline" type="button" onClick={() => void logout()}>Đăng xuất</Button></div>
    </div></header>
    <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
  </div>;
};
