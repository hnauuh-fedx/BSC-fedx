import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { ADMINISTRATION_PERMISSIONS, hasAnyPermission } from '../../features/organization/administration-navigation';

export const MainLayout: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, logout } = useAuth();
  const permissions = user?.permissions ?? [];
  const canReport = permissions.some(permission => ['bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization'].includes(permission));
  const canViewBsc = permissions.some(permission => ['bsc.view.own', 'bsc.view.subordinate', 'bsc.view.unit'].includes(permission));
  const canAdminister = hasAnyPermission(permissions, ADMINISTRATION_PERMISSIONS);
  const linkClass = ({ isActive }: { isActive: boolean }) => isActive ? 'nav-link nav-link-active' : 'nav-link';
  return <div className="app-shell"><a className="skip-link" href="#main-content">Bỏ qua điều hướng</a><header className="app-header"><div className="app-header-inner"><NavLink to="/" className="brand">BSC Management</NavLink><nav className="app-nav" aria-label="Điều hướng chính">{canReport && <NavLink className={linkClass} to="/dashboard">Tổng quan</NavLink>}{canViewBsc && <NavLink className={linkClass} to="/employee-bsc">BSC</NavLink>}{canReport && <NavLink className={linkClass} to="/reports/bsc">Báo cáo</NavLink>}{permissions.some(permission => permission.includes('.approve.subordinate') || permission.includes('.return.subordinate')) && <NavLink className={linkClass} to="/management/bsc-reviews">Chờ duyệt</NavLink>}{canAdminister && <NavLink className={linkClass} to="/management/organization">Quản trị</NavLink>}</nav><div className="user-menu"><span title={user?.email}>{user?.fullName}</span><Button variant="outline" type="button" onClick={() => void logout()}>Đăng xuất</Button></div></div></header><div id="main-content" className="app-content" tabIndex={-1}>{children}</div></div>;
};
