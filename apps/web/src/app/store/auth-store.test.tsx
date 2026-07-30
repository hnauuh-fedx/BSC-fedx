import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceThemeSync } from '../../features/account/appearance-theme';
import { authService } from '../../features/auth/services/auth.service';
import type { AuthUser } from '../../features/auth/types/auth.types';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { MainLayout } from '../layouts/main-layout';
import { AuthProvider } from './auth-store';

vi.mock('../../features/auth/services/auth.service', () => ({
  authService: {
    refresh: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

const originalUser: AuthUser = {
  id: 'user-1', employeeCode: 'NV001', fullName: 'Nguyễn Văn A', email: 'a@example.test',
  status: 'ACTIVE', appearanceTheme: 'REMY', roles: [], permissions: [],
};

const AuthProbe: React.FC = () => {
  const { user, logout, updateCurrentUser } = useAuth();
  return (
    <div>
      <span>{user?.fullName ?? 'Đang tải'}</span>
      <button type="button" onClick={() => updateCurrentUser?.({ ...originalUser, fullName: 'Nguyễn Văn B' })}>
        Cập nhật
      </button>
      <button type="button" onClick={() => void logout()}>
        Đăng xuất
      </button>
    </div>
  );
};

describe('AuthProvider account state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete document.documentElement.dataset.colorTheme;
    vi.mocked(authService.refresh).mockResolvedValue({ accessToken: 'token', expiresIn: 900 });
    vi.mocked(authService.getCurrentUser).mockResolvedValue(originalUser);
    vi.mocked(authService.logout).mockResolvedValue();
  });

  it('publishes an updated current user immediately', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <MemoryRouter>
          <MainLayout><AuthProbe /></MainLayout>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findAllByText('Nguyễn Văn A')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));
    await waitFor(() => expect(screen.getAllByText('Nguyễn Văn B')).toHaveLength(2));
    expect(within(screen.getByRole('banner')).getByText('Nguyễn Văn B')).toBeInTheDocument();
  });

  it('restores the account theme and resets it after logout', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AppearanceThemeSync />
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(document.documentElement.dataset.colorTheme).toBe('remy'));
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(document.documentElement.dataset.colorTheme).toBeUndefined());
  });
});
