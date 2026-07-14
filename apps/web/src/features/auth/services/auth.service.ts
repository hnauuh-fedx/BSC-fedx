import type { LoginRequest, LoginResponse, RefreshResponse, AuthUser } from '../types/auth.types';

const API_BASE = '/api';

/**
 * Auth service — tất cả request đến /auth endpoints.
 *
 * Security decisions:
 * - Access token được trả về và lưu trong memory (AuthStore), không localStorage.
 * - Refresh token nằm trong HttpOnly cookie, browser tự gửi khi credentials: 'include'.
 * - Mọi request đều dùng credentials: 'include' để gửi cookie.
 */

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Lỗi không xác định' }));
    throw Object.assign(new Error(error.message ?? 'Request failed'), {
      status: res.status,
      code: error.code,
    });
  }
  return res.json() as Promise<T>;
}

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse<LoginResponse>(res);
  },

  async refresh(): Promise<RefreshResponse> {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<RefreshResponse>(res);
  },

  async logout(accessToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok && res.status !== 401) {
      // Logout thất bại — vẫn clear local state
      console.warn('Logout request failed, clearing local state anyway.');
    }
  },

  async getCurrentUser(accessToken: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return handleResponse<AuthUser>(res);
  },
};
