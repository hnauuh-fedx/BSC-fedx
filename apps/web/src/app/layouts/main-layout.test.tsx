import React from 'react';
import { render, screen } from '@testing-library/react';
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

describe('MainLayout navigation permissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows administration navigation and hides personal BSC for a technical ADMIN', () => {
    auth(['user.view', 'department.view', 'position.view', 'bsc.period.manage']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Quản trị' })).toHaveAttribute('href', '/management/organization');
    expect(screen.queryByRole('link', { name: 'BSC' })).not.toBeInTheDocument();
  });

  it('keeps BSC visible for a user with business view permission', () => {
    auth(['bsc.view.own']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'BSC' })).toHaveAttribute('href', '/employee-bsc');
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('shows administration navigation for an independently assigned manage permission', () => {
    auth(['department.manage']);
    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Quản trị' })).toBeVisible();
  });
});
