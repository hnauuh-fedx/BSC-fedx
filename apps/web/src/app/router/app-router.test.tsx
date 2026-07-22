import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../features/auth/hooks/use-auth';
import { AppRouter } from './app-router';

vi.mock('../../features/auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));

describe('AppRouter account access', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      status: 'unauthenticated',
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(),
    });
    window.history.pushState({}, '', '/account');
  });

  afterEach(() => window.history.pushState({}, '', '/'));

  it('redirects unauthenticated visitors to login', async () => {
    render(<AppRouter />);

    expect(await screen.findByRole('textbox', { name: 'Tên đăng nhập' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
