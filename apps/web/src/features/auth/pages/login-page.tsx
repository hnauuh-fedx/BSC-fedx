import React, { useEffect, useState, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolvePostLoginPath } from '../landing';
import { useAuth } from '../hooks/use-auth';

interface LoginFormState {
  username: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
}

/**
 * LoginPage — trang đăng nhập tối thiểu cho Phase 2A.
 * Thiết kế premium, sẽ được polish thêm trong phase sau.
 */
export const LoginPage: React.FC = () => {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = (location.state as { from?: string } | null)?.from;
  const [form, setForm] = useState<LoginFormState>({
    username: '',
    password: '',
    error: null,
    isSubmitting: false,
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      navigate(resolvePostLoginPath(user.permissions, requestedPath), { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, requestedPath, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value, error: null }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.isSubmitting) return;

    setForm(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      await login({ username: form.username.trim().toLowerCase(), password: form.password });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Đăng nhập thất bại. Vui lòng thử lại.';
      setForm(prev => ({ ...prev, error: message, isSubmitting: false }));
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">BSC</div>
          <h1 className="login-title">Hệ thống Quản lý BSC</h1>
          <p className="login-subtitle">Đăng nhập để tiếp tục</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="login-username" className="login-label">
              Tên đăng nhập
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              minLength={3}
              maxLength={50}
              pattern="[A-Za-z0-9._-]+"
              required
              disabled={form.isSubmitting}
              value={form.username}
              onChange={handleChange}
              className="login-input"
              aria-invalid={Boolean(form.error)}
              aria-describedby={form.error ? 'login-error' : undefined}
              placeholder="Ví dụ: nguyenvana"
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              Mật khẩu
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={form.isSubmitting}
              value={form.password}
              onChange={handleChange}
              className="login-input"
              aria-invalid={Boolean(form.error)}
              aria-describedby={form.error ? 'login-error' : undefined}
              placeholder="••••••••"
            />
          </div>

          {form.error && (
            <div id="login-error" className="login-error" role="alert" aria-live="assertive">
              {form.error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            disabled={form.isSubmitting}
            aria-busy={form.isSubmitting}
            className="login-btn"
          >
            {form.isSubmitting ? (
              <span className="login-btn-spinner" aria-hidden="true" />
            ) : null}
            {form.isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
};
