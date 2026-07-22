import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { MainLayout } from './main-layout';

vi.mock('../../features/auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const auth = (permissions: string[]) => mockedUseAuth.mockReturnValue({
  user: { id: 'u1', employeeCode: 'A001', fullName: 'Quản trị viên', email: 'admin@example.test', departmentId: 'd1', status: 'ACTIVE', roles: [], permissions },
  isAuthenticated: true, isLoading: false, status: 'authenticated', login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(),
});

const managerAuth = (permissions: string[]) => mockedUseAuth.mockReturnValue({
  user: {
    id: 'manager-1', employeeCode: 'M001', fullName: 'Manager', email: 'manager@example.test', departmentId: 'd1', status: 'ACTIVE',
    roles: [{ code: 'MANAGER' as const, scopeType: 'DEPARTMENT' as const, scopeId: 'd1', permissions }], permissions,
  },
  isAuthenticated: true, isLoading: false, status: 'authenticated', login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(),
});

describe('MainLayout navigation permissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows administration navigation and hides personal BSC for a technical administrator', () => {
    auth(['user.view', 'department.view', 'position.view', 'bsc.period.manage']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Người dùng' })).toHaveAttribute('href', '/management/users');
    expect(screen.getByRole('link', { name: 'Đơn vị' })).toHaveAttribute('href', '/management/departments');
    expect(screen.queryByRole('link', { name: 'BSC cá nhân' })).not.toBeInTheDocument();
  });

  it('shows personal BSC only for an own-BSC permission', () => {
    auth(['bsc.view.own']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'BSC cá nhân' })).toHaveAttribute('href', '/employee-bsc');
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('shows the reopen review queue when the user can review reopen requests', () => {
    auth(['bsc.reopen.subordinate']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Yêu cầu mở lại' }))
      .toHaveAttribute('href', '/management/bsc-reopen-requests');
  });

  it('hides review queues for the canonical MANAGER role even when stale permissions remain', () => {
    managerAuth(['bsc.plan.approve.subordinate', 'bsc.reopen.subordinate']);
    render(<MemoryRouter><MainLayout><p>Content</p></MainLayout></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Ch.*duy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Y.*u c.*u m/ })).not.toBeInTheDocument();
  });

  it('keeps personal BSC hidden for an unit-only dashboard user', () => {
    auth(['bsc.statistics.organization', 'bsc.view.unit']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Báo cáo' })).toHaveAttribute('href', '/reports/bsc');
    expect(screen.getByRole('link', { name: 'Tổng quan BSC' })).toHaveAttribute('href', '/management/bsc-overview');
    expect(screen.queryByRole('link', { name: 'BSC cá nhân' })).not.toBeInTheDocument();
  });

  it('opens the account menu and links every authenticated user to account settings', async () => {
    const user = userEvent.setup();
    auth([]);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Mở menu tài khoản' }));
    expect(screen.getByRole('menuitem', { name: 'Thông tin tài khoản' }))
      .toHaveAttribute('href', '/account');
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();
  });
});
