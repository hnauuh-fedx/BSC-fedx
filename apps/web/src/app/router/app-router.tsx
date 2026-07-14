import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { LoginPage } from '../../features/auth/pages/login-page';
import { OrganizationManagementPage } from '../../features/organization/pages/organization-management-page';
import { DepartmentsPage } from '../../features/organization/pages/departments-page';
import { PositionsPage } from '../../features/organization/pages/positions-page';
import { UsersPage } from '../../features/organization/pages/users-page';
import { UserFormPage } from '../../features/organization/pages/user-form-page';
import { UserDetailPage } from '../../features/organization/pages/user-detail-page';
import { DepartmentEditPage } from '../../features/organization/pages/department-edit-page';
import { PositionEditPage } from '../../features/organization/pages/position-edit-page';

/**
 * ProtectedRoute — redirect về /login nếu chưa xác thực.
 * Hiển thị loading screen khi đang restore session.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading" aria-label="Đang tải...">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/** Placeholder cho dashboard — sẽ triển khai trong phase sau */
const DashboardPlaceholder: React.FC = () => {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: 32 }}>
      <h1>Chào mừng, {user?.fullName}</h1>
      <p>Dashboard sẽ được triển khai trong Phase 2B.</p>
      <button id="btn-logout" onClick={() => void logout()}>
        Đăng xuất
      </button>
    </div>
  );
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPlaceholder />
            </ProtectedRoute>
          }
        />
        <Route path="/management/organization" element={<ProtectedRoute><OrganizationManagementPage /></ProtectedRoute>} />
        <Route path="/management/departments" element={<ProtectedRoute><DepartmentsPage /></ProtectedRoute>} />
        <Route path="/management/departments/:id/edit" element={<ProtectedRoute><DepartmentEditPage /></ProtectedRoute>} />
        <Route path="/management/positions" element={<ProtectedRoute><PositionsPage /></ProtectedRoute>} />
        <Route path="/management/positions/:id/edit" element={<ProtectedRoute><PositionEditPage /></ProtectedRoute>} />
        <Route path="/management/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
        <Route path="/management/users/new" element={<ProtectedRoute><UserFormPage /></ProtectedRoute>} />
        <Route path="/management/users/:id" element={<ProtectedRoute><UserDetailPage /></ProtectedRoute>} />
        <Route path="/management/users/:id/edit" element={<ProtectedRoute><UserFormPage /></ProtectedRoute>} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <Navigate to="/" replace />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};
