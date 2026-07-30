import React, { PropsWithChildren } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import brandLogo from '../../assets/image.png';
import {
  BarChart3Icon,
  Building2Icon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  FileBarChartIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  RotateCcwIcon,
  Settings2Icon,
  TargetIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../../components/ui/sheet';
import {
  canAccessWorkspacePath,
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
import { NotificationBell, NotificationCenterProvider } from '../../features/notifications';

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  end?: boolean;
};

const navigationIcon = (href: string) => {
  if (href.includes('departments')) return Building2Icon;
  if (href.includes('users') || href.includes('roles')) return UsersIcon;
  if (href.includes('audit')) return FileTextIcon;
  return Settings2Icon;
};

const NavigationGroup: React.FC<{ label: string; items: NavigationItem[]; onNavigate?: () => void }> = ({ label, items, onNavigate }) => {
  if (items.length === 0) return null;
  return <section className="shell-nav-group" aria-label={label}>
    <p className="shell-nav-label">{label}</p>
    <div className="shell-nav-list">
      {items.map(({ href, label: itemLabel, icon: Icon, end }) => (
        <NavLink key={href} to={href} end={end} onClick={onNavigate} className={({ isActive }) => isActive ? 'shell-nav-link shell-nav-link-active' : 'shell-nav-link'}>
          <Icon aria-hidden="true" />
          <span>{itemLabel}</span>
        </NavLink>
      ))}
    </div>
  </section>;
};

const ShellNavigation: React.FC<{ workspace: NavigationItem[]; management: NavigationItem[]; administration: NavigationItem[]; onNavigate?: () => void }> = (props) => <nav className="shell-navigation" aria-label="Điều hướng chính">
  <NavigationGroup label="Không gian làm việc" items={props.workspace} onNavigate={props.onNavigate}/>
  <NavigationGroup label="Quản lý BSC" items={props.management} onNavigate={props.onNavigate}/>
  <NavigationGroup label="Quản trị hệ thống" items={props.administration} onNavigate={props.onNavigate}/>
</nav>;

export const MainLayout: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
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
  const canViewManagementOverview = hasAnyWorkspacePermission(permissions, MANAGEMENT_OVERVIEW_PERMISSIONS);
  const userInitials = user?.fullName.trim().split(/\s+/).filter(Boolean)
    .filter((_, index, words) => index === 0 || index === words.length - 1)
    .map((word) => word[0]).join('').toUpperCase() || '?';

  const workspace: NavigationItem[] = [
    ...(canAccessWorkspacePath('/dashboard', permissions) ? [{ href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboardIcon, end: true }] : []),
    ...(canViewOwnBsc ? [{ href: '/employee-bsc', label: 'BSC cá nhân', icon: TargetIcon, end: true }] : []),
    ...(canViewDepartmentBsc ? [{ href: '/department-bsc', label: 'BSC phòng ban', icon: Building2Icon, end: true }] : []),
  ];
  const management: NavigationItem[] = [
    ...(canViewManagementOverview ? [{ href: '/management/bsc-overview', label: 'Tổng quan BSC', icon: BarChart3Icon }] : []),
    ...(canReview ? [{ href: '/management/bsc-reviews', label: 'Chờ duyệt', icon: ClipboardCheckIcon }] : []),
    ...(canReviewDepartmentBsc ? [{ href: '/management/department-bsc-reviews', label: 'Duyệt BSC phòng ban', icon: ClipboardCheckIcon }] : []),
    ...(canReviewReopen ? [{ href: '/management/bsc-reopen-requests', label: 'Yêu cầu mở lại', icon: RotateCcwIcon }] : []),
    ...(canReport ? [{ href: '/reports/bsc', label: 'Báo cáo', icon: FileBarChartIcon }] : []),
    ...(canCreateMinutes ? [{ href: '/management/bsc-minutes', label: 'Biên bản', icon: FileTextIcon }] : []),
  ];
  const administration: NavigationItem[] = ADMINISTRATION_DESTINATIONS
    .filter((item) => hasAnyPermission(permissions, item.permissions))
    .map((item) => ({ href: item.href, label: item.label, icon: navigationIcon(item.href) }));
  const currentLabel = location.pathname === '/notifications' ? 'Thông báo' : [...workspace, ...management, ...administration]
    .filter((item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? 'BSC Management';

  const accountMenu = <DropdownMenu>
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
        <DropdownMenuItem asChild><NavLink to="/account"><UserRoundIcon />Thông tin tài khoản</NavLink></DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem onSelect={() => void logout()}><LogOutIcon />Đăng xuất</DropdownMenuItem></DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;

  return <NotificationCenterProvider><div className="app-shell">
    <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
    <aside className="app-sidebar">
      <NavLink to="/" className="brand">
        <img className="brand-logo" src={brandLogo} alt="" width={44} height={44}/>
        <span>BSC Management</span>
      </NavLink>
      <ShellNavigation workspace={workspace} management={management} administration={administration}/>
      <p className="sidebar-caption">Quản trị hiệu suất rõ ràng, nhất quán.</p>
    </aside>
    <div className="app-workspace">
      <header className="app-header">
        <div className="mobile-menu">
          <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Mở điều hướng"><MenuIcon data-icon="inline-start" /></Button></SheetTrigger>
            <SheetContent side="left" className="w-[min(22rem,88vw)] p-0">
              <div className="mobile-navigation-header">
                <img className="mobile-brand-logo" src={brandLogo} alt="" width={40} height={40}/>
                <div>
                  <SheetTitle>BSC Management</SheetTitle>
                  <SheetDescription>Điều hướng theo quyền tài khoản</SheetDescription>
                </div>
              </div>
              <ShellNavigation workspace={workspace} management={management} administration={administration} onNavigate={() => setMobileNavigationOpen(false)}/>
            </SheetContent>
          </Sheet>
        </div>
        <div className="app-header-context"><span>Không gian làm việc</span><strong>{currentLabel}</strong></div>
        <div className="user-menu"><NotificationBell />{accountMenu}</div>
      </header>
      <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
    </div>
  </div></NotificationCenterProvider>;
};
