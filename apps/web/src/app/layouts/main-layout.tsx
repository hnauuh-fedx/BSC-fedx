import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDownIcon, LogOutIcon, UserRoundIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
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
  const isManagerWithoutDirector = (user?.roles.some((role) => role.code === 'MANAGER') ?? false)
    && !(user?.roles.some((role) => role.code === 'DIRECTOR') ?? false);
  const canReport = hasAnyWorkspacePermission(permissions, REPORT_PERMISSIONS);
  const canCreateMinutes = permissions.includes('bsc.minutes.create');
  const canViewOwnBsc = permissions.includes('bsc.view.own');
  const canViewDepartmentBsc = permissions.includes('bsc.department.view');
  const canReviewDepartmentBsc = [
    'bsc.department.plan.approve', 'bsc.department.plan.return',
    'bsc.department.evaluation.approve', 'bsc.department.evaluation.return',
  ].some((permission) => permissions.includes(permission));
  const canReview = !isManagerWithoutDirector && hasAnyWorkspacePermission(permissions, REVIEW_QUEUE_PERMISSIONS);
  const canReviewReopen = !isManagerWithoutDirector && permissions.includes('bsc.reopen.subordinate');
  const canViewManagementOverview = hasAnyWorkspacePermission(
    permissions,
    MANAGEMENT_OVERVIEW_PERMISSIONS,
  );
  const administrationDestinations = ADMINISTRATION_DESTINATIONS.filter((item) =>
    hasAnyPermission(permissions, item.permissions),
  );
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link nav-link-active' : 'nav-link';
  const userInitials = user?.fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, index, words) => index === 0 || index === words.length - 1)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';

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
            {canViewDepartmentBsc && (
              <NavLink className={linkClass} to="/department-bsc">BSC phòng ban</NavLink>
            )}
            {canReviewDepartmentBsc && (
              <NavLink className={linkClass} to="/management/department-bsc-reviews">Duyệt BSC phòng ban</NavLink>
            )}
            {canViewManagementOverview && (
              <NavLink className={linkClass} to="/management/bsc-overview">Tổng quan BSC</NavLink>
            )}
            {canReport && <NavLink className={linkClass} to="/reports/bsc">Báo cáo</NavLink>}
            {canCreateMinutes && <NavLink className={linkClass} to="/management/bsc-minutes">Biên bản</NavLink>}
            {canReview && (
              <NavLink className={linkClass} to="/management/bsc-reviews">Chờ duyệt</NavLink>
            )}
            {canReviewReopen && (
              <NavLink className={linkClass} to="/management/bsc-reopen-requests">Yêu cầu mở lại</NavLink>
            )}
            {administrationDestinations.map((item) => (
              <NavLink className={linkClass} key={item.href} to={item.href}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="user-menu">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" type="button" aria-label="Mở menu tài khoản">
                  <Avatar size="sm"><AvatarFallback>{userInitials}</AvatarFallback></Avatar>
                  <span className="user-menu-name" title={user?.email}>{user?.fullName}</span>
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <span className="block truncate text-foreground">{user?.fullName}</span>
                    <span className="block truncate font-normal">{user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <NavLink to="/account"><UserRoundIcon />Thông tin tài khoản</NavLink>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => void logout()}>
                    <LogOutIcon />Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
    </div>
  );
};
