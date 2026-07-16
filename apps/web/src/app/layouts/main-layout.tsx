import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import {
  hasAnyWorkspacePermission,
  MANAGEMENT_OVERVIEW_PERMISSIONS,
  REPORT_PERMISSIONS,
  REVIEW_QUEUE_PERMISSIONS,
} from '../../features/auth/landing';
import { useAuth } from '../../features/auth/hooks/use-auth';
import {
  ADMINISTRATION_DESTINATIONS,
  hasAnyPermission,
} from '../../features/organization/administration-navigation';

export const MainLayout: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, logout } = useAuth();
  const permissions = user?.permissions ?? [];
  const canReport = hasAnyWorkspacePermission(permissions, REPORT_PERMISSIONS);
  const canViewOwnBsc = permissions.includes('bsc.view.own');
  const canReview = hasAnyWorkspacePermission(permissions, REVIEW_QUEUE_PERMISSIONS);
  const canViewManagementOverview = hasAnyWorkspacePermission(
    permissions,
    MANAGEMENT_OVERVIEW_PERMISSIONS,
  );
  const administrationDestinations = ADMINISTRATION_DESTINATIONS.filter((item) =>
    hasAnyPermission(permissions, item.permissions),
  );
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link nav-link-active' : 'nav-link';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="brand">BSC Management</NavLink>
          <nav className="app-nav" aria-label="Điều hướng chính">
            {canViewOwnBsc && (
              <NavLink className={linkClass} to="/employee-bsc">BSC cá nhân</NavLink>
            )}
            {canViewManagementOverview && (
              <NavLink className={linkClass} to="/management/bsc-overview">Tổng quan BSC</NavLink>
            )}
            {canReport && <NavLink className={linkClass} to="/reports/bsc">Báo cáo</NavLink>}
            {canReview && (
              <NavLink className={linkClass} to="/management/bsc-reviews">Chờ duyệt</NavLink>
            )}
            {administrationDestinations.map((item) => (
              <NavLink className={linkClass} key={item.href} to={item.href}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="user-menu">
            <span title={user?.email}>{user?.fullName}</span>
            <Button variant="outline" type="button" onClick={() => void logout()}>Đăng xuất</Button>
          </div>
        </div>
      </header>
      <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
    </div>
  );
};
