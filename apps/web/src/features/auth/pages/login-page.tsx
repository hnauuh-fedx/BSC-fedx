import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth';

interface LoginFormState {
  email: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
}

/**
 * LoginPage — trang đăng nhập tối thiểu cho Phase 2A.
 * Thiết kế premium, sẽ được polish thêm trong phase sau.
 */
export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginFormState>({
    email: '',
    password: '',
    error: null,
    isSubmitting: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value, error: null }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.isSubmitting) return;

    setForm(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      await login({ email: form.email, password: form.password });
      navigate('/', { replace: true });
      // Redirect sẽ được handle bởi AppRouter khi auth state thay đổi
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
            <label htmlFor="login-email" className="login-label">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={form.isSubmitting}
              value={form.email}
              onChange={handleChange}
              className="login-input"
              aria-invalid={Boolean(form.error)}
              aria-describedby={form.error ? 'login-error' : undefined}
              placeholder="ten@cong-ty.vn"
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
