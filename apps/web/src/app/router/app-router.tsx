import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  canAccessWorkspacePath,
  hasAnyWorkspacePermission,
  MANAGEMENT_QUEUE_PERMISSIONS,
  MANAGEMENT_REPORT_PERMISSIONS,
  resolveLandingPath,
} from '../../features/auth/landing';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { ForbiddenPage } from '../../features/auth/pages/forbidden-page';
import { LoginPage } from '../../features/auth/pages/login-page';
import { AccountPage } from '../../features/account/pages/account-page';
import { AuditLogsPage } from '../../features/audit-logs';
import { BscCycleDetailPage, BscCycleFormPage, BscCyclesPage } from '../../features/bsc-cycles';
import { BscMinutesPage } from '../../features/bsc-minutes';
import { DepartmentBscCreatePage, DepartmentBscDetailPage, DepartmentBscListPage, DepartmentBscPendingReviewPage } from '../../features/department-bsc';
import {
  BscCreatePage,
  BscDetailPage,
  BscEditPage,
  BscListPage,
  BscPendingReviewPage,
  BscReopenRequestsPage,
} from '../../features/employee-bsc';
import { AdministrationHome } from '../../features/organization/pages/administration-home';
import { DepartmentEditPage } from '../../features/organization/pages/department-edit-page';
import { DepartmentsPage } from '../../features/organization/pages/departments-page';
import { OrganizationManagementPage } from '../../features/organization/pages/organization-management-page';
import { PositionEditPage } from '../../features/organization/pages/position-edit-page';
import { PositionsPage } from '../../features/organization/pages/positions-page';
import { UserDetailPage } from '../../features/organization/pages/user-detail-page';
import { UserFormPage } from '../../features/organization/pages/user-form-page';
import { UsersPage } from '../../features/organization/pages/users-page';
import { BscReportPage, DashboardPage, ManagementBscOverviewPage } from '../../features/reports';
import { RoleDetailPage, RolesListPage } from '../../features/roles';
import { NotificationsPage } from '../../features/notifications';
import { MainLayout } from '../layouts/main-layout';

const LoadingPage: React.FC = () => (
  <div className="app-loading" aria-label="Đang tải...">
    <div className="app-loading-spinner" />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingPage />;
  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <>{children}</>;
};

const WorkspaceRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const permissions = user?.permissions ?? [];

  if (!canAccessWorkspacePath(location.pathname, permissions)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const WorkspacePage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute>
    <WorkspaceRoute>
      <MainLayout>{children}</MainLayout>
    </WorkspaceRoute>
  </ProtectedRoute>
);

/** Auth-aware dispatcher for the root route. */
const PermissionLandingPage: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <LoadingPage />;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  return <Navigate to={resolveLandingPath(user.permissions)} replace />;
};

export const AppRouter: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PermissionLandingPage />} />
      <Route path="/forbidden" element={<ProtectedRoute><ForbiddenPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><MainLayout><AccountPage /></MainLayout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><MainLayout><NotificationsPage /></MainLayout></ProtectedRoute>} />

      <Route path="/dashboard" element={<WorkspacePage><DashboardPage /></WorkspacePage>} />
      <Route path="/management/bsc-overview" element={<WorkspacePage><ManagementOverviewRoute /></WorkspacePage>} />
      <Route path="/reports/bsc" element={<WorkspacePage><BscReportPage /></WorkspacePage>} />
      <Route path="/management/bsc-minutes" element={<WorkspacePage><BscMinutesPage /></WorkspacePage>} />

      <Route path="/management" element={<WorkspacePage><AdministrationRoute /></WorkspacePage>} />
      <Route path="/management/organization" element={<WorkspacePage><OrganizationManagementPage /></WorkspacePage>} />
      <Route path="/management/departments" element={<WorkspacePage><DepartmentsPage /></WorkspacePage>} />
      <Route path="/management/departments/:id/edit" element={<WorkspacePage><DepartmentEditPage /></WorkspacePage>} />
      <Route path="/management/positions" element={<WorkspacePage><PositionsPage /></WorkspacePage>} />
      <Route path="/management/positions/:id/edit" element={<WorkspacePage><PositionEditPage /></WorkspacePage>} />
      <Route path="/management/users" element={<WorkspacePage><UsersPage /></WorkspacePage>} />
      <Route path="/management/users/new" element={<WorkspacePage><UserFormPage /></WorkspacePage>} />
      <Route path="/management/users/:id" element={<WorkspacePage><UserDetailPage /></WorkspacePage>} />
      <Route path="/management/users/:id/edit" element={<WorkspacePage><UserFormPage /></WorkspacePage>} />
      <Route path="/management/bsc-cycles" element={<WorkspacePage><BscCyclesPage /></WorkspacePage>} />
      <Route path="/management/bsc-cycles/new" element={<WorkspacePage><BscCycleFormPage /></WorkspacePage>} />
      <Route path="/management/bsc-cycles/:id" element={<WorkspacePage><BscCycleDetailPage /></WorkspacePage>} />
      <Route path="/management/bsc-cycles/:id/edit" element={<WorkspacePage><BscCycleFormPage /></WorkspacePage>} />
      <Route path="/management/roles" element={<WorkspacePage><RolesListPage /></WorkspacePage>} />
      <Route path="/management/roles/:id" element={<WorkspacePage><RoleDetailPage /></WorkspacePage>} />
      <Route path="/management/audit-logs" element={<WorkspacePage><AuditLogsPage /></WorkspacePage>} />

      <Route path="/employee-bsc" element={<WorkspacePage><BscListPage /></WorkspacePage>} />
      <Route path="/employee-bsc/new" element={<WorkspacePage><BscCreatePage /></WorkspacePage>} />
      <Route path="/employee-bsc/:id" element={<WorkspacePage><BscDetailPage /></WorkspacePage>} />
      <Route path="/employee-bsc/:id/edit" element={<WorkspacePage><BscEditPage /></WorkspacePage>} />
      <Route path="/management/bsc-reviews" element={<WorkspacePage><BscPendingReviewPage /></WorkspacePage>} />
      <Route path="/management/bsc-reopen-requests" element={<WorkspacePage><BscReopenRequestsPage /></WorkspacePage>} />
      <Route path="/department-bsc" element={<WorkspacePage><DepartmentBscListPage /></WorkspacePage>} />
      <Route path="/department-bsc/new" element={<WorkspacePage><DepartmentBscCreatePage /></WorkspacePage>} />
      <Route path="/department-bsc/:id" element={<WorkspacePage><DepartmentBscDetailPage /></WorkspacePage>} />
      <Route path="/management/department-bsc-reviews" element={<WorkspacePage><DepartmentBscPendingReviewPage /></WorkspacePage>} />

      <Route path="*" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
    </Routes>
  </BrowserRouter>
);

const AdministrationRoute: React.FC = () => {
  const { user } = useAuth();
  return <AdministrationHome permissions={user?.permissions ?? []} />;
};

const ManagementOverviewRoute: React.FC = () => {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  if (hasAnyWorkspacePermission(permissions, MANAGEMENT_REPORT_PERMISSIONS)) {
    return <ManagementBscOverviewPage />;
  }
  if (hasAnyWorkspacePermission(permissions, MANAGEMENT_QUEUE_PERMISSIONS)) {
    return <BscPendingReviewPage />;
  }
  if (permissions.includes('bsc.reopen.subordinate')) return <BscReopenRequestsPage />;
  if (permissions.includes('bsc.view.unit')) return <BscListPage />;
  return <OrganizationScopeWorkspace />;
};

const OrganizationScopeWorkspace: React.FC = () => (
  <main>
    <h1 className="text-3xl font-semibold">Tổng quan BSC tổ chức</h1>
    <p className="mt-3 text-muted-foreground">
      Chưa có dữ liệu tổng quan khả dụng cho phạm vi tổ chức của tài khoản này.
    </p>
  </main>
);
