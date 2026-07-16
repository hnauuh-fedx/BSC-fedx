import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { resolveLandingPath } from '../../features/auth/landing';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { LoginPage } from '../../features/auth/pages/login-page';
import { BscCycleDetailPage, BscCycleFormPage, BscCyclesPage } from '../../features/bsc-cycles';
import { BscCreatePage, BscDetailPage, BscEditPage, BscListPage, BscPendingReviewPage, BscReopenRequestsPage } from '../../features/employee-bsc';
import { DepartmentEditPage } from '../../features/organization/pages/department-edit-page';
import { AdministrationHome } from '../../features/organization/pages/administration-home';
import { DepartmentsPage } from '../../features/organization/pages/departments-page';
import { OrganizationManagementPage } from '../../features/organization/pages/organization-management-page';
import { PositionEditPage } from '../../features/organization/pages/position-edit-page';
import { PositionsPage } from '../../features/organization/pages/positions-page';
import { UserDetailPage } from '../../features/organization/pages/user-detail-page';
import { UserFormPage } from '../../features/organization/pages/user-form-page';
import { UsersPage } from '../../features/organization/pages/users-page';
import { ADMINISTRATION_PERMISSIONS, hasAnyPermission } from '../../features/organization/administration-navigation';
import { BscReportPage, DashboardPage, ManagementBscOverviewPage } from '../../features/reports';
import { RolesListPage, RoleDetailPage } from '../../features/roles';
import { AuditLogsPage } from '../../features/audit-logs';
import { MainLayout } from '../layouts/main-layout';

const REPORT_PERMISSIONS = ['bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization'];

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="app-loading" aria-label="Đang tải..."><div className="app-loading-spinner" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};
const ProtectedPage: React.FC<{ children: React.ReactNode }> = ({ children }) => <ProtectedRoute><MainLayout>{children}</MainLayout></ProtectedRoute>;
const HomePage: React.FC = () => {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  switch (resolveLandingPath(permissions)) {
    case '/employee-bsc': return <BscListPage />;
    case '/dashboard': return <DashboardPage />;
    case '/management/bsc-reviews': return <BscPendingReviewPage />;
    case '/management': return <AdministrationHome permissions={permissions} />;
    default: return <main><h1 className="text-3xl font-semibold">Chưa có chức năng khả dụng</h1><p className="mt-3">Tài khoản chưa được cấp permission cho một khu vực làm việc. Liên hệ quản trị viên để được hỗ trợ.</p></main>;
  }
};
const ReportDashboardRoute: React.FC = () => {
  const { user } = useAuth();
  return user?.permissions.some((permission) => REPORT_PERMISSIONS.includes(permission)) ? <DashboardPage /> : <Navigate to="/" replace />;
};
const BscReportRoute: React.FC = () => {
  const { user } = useAuth();
  return user?.permissions.some((permission) => REPORT_PERMISSIONS.includes(permission)) ? <BscReportPage /> : <Navigate to="/" replace />;
};
const AdministrationRoute: React.FC = () => {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  return hasAnyPermission(permissions, ADMINISTRATION_PERMISSIONS)
    ? <AdministrationHome permissions={permissions} />
    : <Navigate to="/" replace />;
};

/** Route guard: redirect to "/" if user lacks ANY of the given permissions */
const PermissionRoute: React.FC<{ children: React.ReactNode; anyOf: string[] }> = ({ children, anyOf }) => {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  return permissions.some((p) => anyOf.includes(p)) ? <>{children}</> : <Navigate to="/" replace />;
};

export const AppRouter: React.FC = () => <BrowserRouter><Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/" element={<ProtectedPage><HomePage /></ProtectedPage>} />
  <Route path="/dashboard" element={<ProtectedPage><ReportDashboardRoute /></ProtectedPage>} />
  <Route path="/management/bsc-overview" element={<ProtectedPage><ManagementBscOverviewPage /></ProtectedPage>} />
  <Route path="/reports/bsc" element={<ProtectedPage><BscReportRoute /></ProtectedPage>} />
  <Route path="/management" element={<ProtectedPage><AdministrationRoute /></ProtectedPage>} />
  <Route path="/management/organization" element={<ProtectedPage><OrganizationManagementPage /></ProtectedPage>} />
  <Route path="/management/departments" element={<ProtectedPage><DepartmentsPage /></ProtectedPage>} />
  <Route path="/management/departments/:id/edit" element={<ProtectedPage><DepartmentEditPage /></ProtectedPage>} />
  <Route path="/management/positions" element={<ProtectedPage><PositionsPage /></ProtectedPage>} />
  <Route path="/management/positions/:id/edit" element={<ProtectedPage><PositionEditPage /></ProtectedPage>} />
  <Route path="/management/users" element={<ProtectedPage><UsersPage /></ProtectedPage>} />
  <Route path="/management/users/new" element={<ProtectedPage><UserFormPage /></ProtectedPage>} />
  <Route path="/management/users/:id" element={<ProtectedPage><UserDetailPage /></ProtectedPage>} />
  <Route path="/management/users/:id/edit" element={<ProtectedPage><UserFormPage /></ProtectedPage>} />
  <Route path="/management/bsc-cycles" element={<ProtectedPage><BscCyclesPage /></ProtectedPage>} />
  <Route path="/management/bsc-cycles/new" element={<ProtectedPage><BscCycleFormPage /></ProtectedPage>} />
  <Route path="/management/bsc-cycles/:id" element={<ProtectedPage><BscCycleDetailPage /></ProtectedPage>} />
  <Route path="/management/bsc-cycles/:id/edit" element={<ProtectedPage><BscCycleFormPage /></ProtectedPage>} />
  <Route path="/management/roles" element={<ProtectedPage><PermissionRoute anyOf={['role.view']}><RolesListPage /></PermissionRoute></ProtectedPage>} />
  <Route path="/management/roles/:id" element={<ProtectedPage><PermissionRoute anyOf={['role.view']}><RoleDetailPage /></PermissionRoute></ProtectedPage>} />
  <Route path="/management/audit-logs" element={<ProtectedPage><PermissionRoute anyOf={['audit.view']}><AuditLogsPage /></PermissionRoute></ProtectedPage>} />
  <Route path="/employee-bsc" element={<ProtectedPage><BscListPage /></ProtectedPage>} />
  <Route path="/employee-bsc/new" element={<ProtectedPage><BscCreatePage /></ProtectedPage>} />
  <Route path="/employee-bsc/:id" element={<ProtectedPage><BscDetailPage /></ProtectedPage>} />
  <Route path="/employee-bsc/:id/edit" element={<ProtectedPage><BscEditPage /></ProtectedPage>} />
  <Route path="/management/bsc-reviews" element={<ProtectedPage><BscPendingReviewPage /></ProtectedPage>} />
  <Route path="/management/bsc-reopen-requests" element={<ProtectedPage><BscReopenRequestsPage /></ProtectedPage>} />
  <Route path="/no-access" element={<ProtectedPage><main><h1 className="text-3xl font-semibold">Chưa có chức năng khả dụng</h1><p className="mt-3">Tài khoản chưa được cấp permission cho một khu vực làm việc. Liên hệ quản trị viên để được hỗ trợ.</p></main></ProtectedPage>} />
  <Route path="*" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
</Routes></BrowserRouter>;
