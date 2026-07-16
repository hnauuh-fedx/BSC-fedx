import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { LoginPage } from '../../features/auth/pages/login-page';
import { BscCreatePage, BscDetailPage, BscEditPage, BscListPage, BscPendingReviewPage, BscReopenRequestsPage } from '../../features/employee-bsc';
import { DepartmentEditPage } from '../../features/organization/pages/department-edit-page';
import { ADMINISTRATION_PERMISSIONS } from '../../features/organization/administration-navigation';
import { AdministrationHome } from '../../features/organization/pages/administration-home';
import { DepartmentsPage } from '../../features/organization/pages/departments-page';
import { OrganizationManagementPage } from '../../features/organization/pages/organization-management-page';
import { PositionEditPage } from '../../features/organization/pages/position-edit-page';
import { PositionsPage } from '../../features/organization/pages/positions-page';
import { UserDetailPage } from '../../features/organization/pages/user-detail-page';
import { UserFormPage } from '../../features/organization/pages/user-form-page';
import { UsersPage } from '../../features/organization/pages/users-page';
import { BscReportPage, DashboardPage } from '../../features/reports';
import { MainLayout } from '../layouts/main-layout';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="app-loading" aria-label="Đang tải..."><div className="app-loading-spinner" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};
const ProtectedPage: React.FC<{ children: React.ReactNode }> = ({ children }) => <ProtectedRoute><MainLayout>{children}</MainLayout></ProtectedRoute>;
const REPORT_PERMISSIONS = ['bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization'];
const HomePage: React.FC = () => {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  if (permissions.some(permission => REPORT_PERMISSIONS.includes(permission))) return <DashboardPage/>;
  if (permissions.some(permission => ADMINISTRATION_PERMISSIONS.includes(permission))) return <AdministrationHome permissions={permissions}/>;
  return <main><h1 className="text-3xl font-semibold">BSC Management</h1><p className="mt-3">Tài khoản chưa được cấp chức năng phù hợp. Liên hệ quản trị viên phân quyền.</p></main>;
};
const ReportDashboardRoute: React.FC = () => {
  const { user } = useAuth();
  return user?.permissions.some(permission => REPORT_PERMISSIONS.includes(permission)) ? <DashboardPage/> : <Navigate to="/" replace/>;
};
const BscReportRoute: React.FC = () => {
  const { user } = useAuth();
  return user?.permissions.some(permission => REPORT_PERMISSIONS.includes(permission)) ? <BscReportPage/> : <Navigate to="/" replace/>;
};

export const AppRouter: React.FC = () => <BrowserRouter><Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/" element={<ProtectedPage><HomePage /></ProtectedPage>} />
  <Route path="/dashboard" element={<ProtectedPage><ReportDashboardRoute /></ProtectedPage>} />
  <Route path="/reports/bsc" element={<ProtectedPage><BscReportRoute /></ProtectedPage>} />
  <Route path="/management/organization" element={<ProtectedPage><OrganizationManagementPage /></ProtectedPage>} />
  <Route path="/management/departments" element={<ProtectedPage><DepartmentsPage /></ProtectedPage>} />
  <Route path="/management/departments/:id/edit" element={<ProtectedPage><DepartmentEditPage /></ProtectedPage>} />
  <Route path="/management/positions" element={<ProtectedPage><PositionsPage /></ProtectedPage>} />
  <Route path="/management/positions/:id/edit" element={<ProtectedPage><PositionEditPage /></ProtectedPage>} />
  <Route path="/management/users" element={<ProtectedPage><UsersPage /></ProtectedPage>} />
  <Route path="/management/users/new" element={<ProtectedPage><UserFormPage /></ProtectedPage>} />
  <Route path="/management/users/:id" element={<ProtectedPage><UserDetailPage /></ProtectedPage>} />
  <Route path="/management/users/:id/edit" element={<ProtectedPage><UserFormPage /></ProtectedPage>} />
  <Route path="/employee-bsc" element={<ProtectedPage><BscListPage /></ProtectedPage>} />
  <Route path="/employee-bsc/new" element={<ProtectedPage><BscCreatePage /></ProtectedPage>} />
  <Route path="/employee-bsc/:id" element={<ProtectedPage><BscDetailPage /></ProtectedPage>} />
  <Route path="/employee-bsc/:id/edit" element={<ProtectedPage><BscEditPage /></ProtectedPage>} />
  <Route path="/management/bsc-reviews" element={<ProtectedPage><BscPendingReviewPage /></ProtectedPage>} />
  <Route path="/management/bsc-reopen-requests" element={<ProtectedPage><BscReopenRequestsPage /></ProtectedPage>} />
  <Route path="*" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
</Routes></BrowserRouter>;
