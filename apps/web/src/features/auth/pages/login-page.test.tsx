import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../hooks/use-auth';
import { LoginPage } from './login-page';

vi.mock('../hooks/use-auth', () => ({ useAuth: vi.fn() }));

describe('LoginPage', () => {
  const login = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      status: 'unauthenticated',
      login,
      logout: vi.fn(),
      getAccessToken: vi.fn(),
    });
  });

  it('logs in with a normalized username instead of an email', async () => {
    const user = userEvent.setup();
    login.mockResolvedValue(undefined);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Tên đăng nhập' }), '  NguyenVanA  ');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password!123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(login).toHaveBeenCalledWith({ username: 'nguyenvana', password: 'Password!123' });
  });
});
