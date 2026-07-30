import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/hooks/use-auth';
import { accountApi } from '../account-api';
import { AccountPage } from './account-page';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../account-api', () => ({
  accountApi: {
    updateProfile: vi.fn(),
    updatePreferences: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const currentUser = {
  id: 'employee-1',
  employeeCode: 'NV001',
  fullName: 'Nguyễn Văn A',
  email: 'nguyenvana@example.test',
  status: 'ACTIVE',
  appearanceTheme: 'DEFAULT' as const,
  departmentId: 'department-1',
  roles: [{ code: 'EMPLOYEE', scopeType: 'SELF' as const, scopeId: null }],
  permissions: [],
};

describe('AccountPage', () => {
  const logout = vi.fn();
  const clearSession = vi.fn();
  const updateCurrentUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: currentUser,
      isAuthenticated: true,
      isLoading: false,
      status: 'authenticated',
      login: vi.fn(),
      logout,
      getAccessToken: vi.fn(() => 'token'),
      updateCurrentUser,
      clearSession,
    });
  });

  it('updates the canonical full name and refreshes auth state', async () => {
    const user = userEvent.setup();
    const updatedUser = { ...currentUser, fullName: 'Nguyễn Văn B' };
    vi.mocked(accountApi.updateProfile).mockResolvedValue(updatedUser);
    render(<MemoryRouter><AccountPage /></MemoryRouter>);

    expect(screen.getByDisplayValue(currentUser.email)).toBeDisabled();
    const fullName = screen.getByRole('textbox', { name: 'Họ và tên' });
    await user.clear(fullName);
    await user.type(fullName, '  Nguyễn Văn B  ');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(accountApi.updateProfile).toHaveBeenCalledWith({ fullName: 'Nguyễn Văn B' });
    expect(updateCurrentUser).toHaveBeenCalledWith(updatedUser);
  });

  it('keeps profile submission disabled when the trimmed name is empty', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AccountPage /></MemoryRouter>);

    const fullName = screen.getByRole('textbox', { name: 'Họ và tên' });
    await user.clear(fullName);
    await user.type(fullName, '   ');

    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    expect(screen.getByText('Vui lòng nhập họ và tên.')).toBeInTheDocument();
  });

  it('saves the Remy appearance template and refreshes auth state', async () => {
    const user = userEvent.setup();
    const updatedUser = { ...currentUser, appearanceTheme: 'REMY' as const };
    vi.mocked(accountApi.updatePreferences).mockResolvedValue(updatedUser);
    render(<MemoryRouter><AccountPage /></MemoryRouter>);

    await user.click(screen.getByRole('radio', { name: /Remy/i }));
    await user.click(screen.getByRole('button', { name: 'Lưu giao diện' }));

    expect(accountApi.updatePreferences).toHaveBeenCalledWith({ appearanceTheme: 'REMY' });
    expect(updateCurrentUser).toHaveBeenCalledWith(updatedUser);
  });

  it('uses one fixed label column and one full-width control column for every field', () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);

    for (const label of ['Họ và tên', 'Email', 'Mật khẩu hiện tại', 'Mật khẩu mới', 'Xác nhận mật khẩu mới']) {
      const field = screen.getByText(label).closest('[data-slot="field"]');
      expect(field).toHaveClass('grid-cols-[11rem_minmax(0,1fr)]');
      expect(field).toHaveClass('grid');
      expect(field).not.toHaveClass('flex');
      expect(screen.getByText(label)).toHaveClass('whitespace-nowrap');
      expect(field?.querySelector(':scope > [data-slot="field-content"]')).toBeInTheDocument();
    }
  });

  it('validates password confirmation before submitting and signs out after success', async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.changePassword).mockResolvedValue({ reauthenticate: true });
    render(<MemoryRouter><AccountPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'Current!Password1');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'New!Password#2026');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'Different!Password1');
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    expect(accountApi.changePassword).not.toHaveBeenCalled();

    const confirmation = screen.getByLabelText('Xác nhận mật khẩu mới');
    await user.clear(confirmation);
    await user.type(confirmation, 'New!Password#2026');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(accountApi.changePassword).toHaveBeenCalledWith({
      currentPassword: 'Current!Password1',
      newPassword: 'New!Password#2026',
    });
    expect(clearSession).toHaveBeenCalledOnce();
    expect(logout).not.toHaveBeenCalled();
  });

  it('toggles password visibility from the keyboard', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    const passwordInput = screen.getByLabelText('Mật khẩu mới');
    expect(passwordInput).toHaveAttribute('type', 'password');
    screen.getByRole('button', { name: 'Hiện mật khẩu mới' }).focus();
    await user.keyboard('{Enter}');
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu mới' })).toBeInTheDocument();
  });
});
