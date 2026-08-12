import React, { useEffect, useState, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircleIcon, ArrowRightIcon } from 'lucide-react';
import brandLogo from '../../../assets/image.png';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Spinner } from '../../../components/ui/spinner';
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
      navigate(resolvePostLoginPath(user.permissions, requestedPath, user.roles), { replace: true });
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
      <Card className="login-card">
        <CardHeader className="login-brand">
          <img className="login-brand-logo" src={brandLogo} alt="" width={96} height={96}/>
          <CardTitle><h1>Hệ thống Quản lý BSC</h1></CardTitle>
          <CardDescription>Đăng nhập để tiếp tục công việc của bạn</CardDescription>
        </CardHeader>

        <CardContent>
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <FieldGroup>
          <Field data-invalid={Boolean(form.error)} data-disabled={form.isSubmitting}>
            <FieldLabel htmlFor="login-username">Tên đăng nhập</FieldLabel>
            <Input
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
              aria-invalid={Boolean(form.error)}
              aria-describedby={form.error ? 'login-error' : undefined}
              placeholder="Ví dụ: nguyenvana"
            />
          </Field>

          <Field data-invalid={Boolean(form.error)} data-disabled={form.isSubmitting}>
            <FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={form.isSubmitting}
              value={form.password}
              onChange={handleChange}
              aria-invalid={Boolean(form.error)}
              aria-describedby={form.error ? 'login-error' : undefined}
              placeholder="••••••••"
            />
          </Field>
          </FieldGroup>

          {form.error && (
            <Alert id="login-error" variant="destructive" role="alert" aria-live="assertive">
              <AlertCircleIcon />
              <AlertTitle>Không thể đăng nhập</AlertTitle>
              <AlertDescription>{form.error}</AlertDescription>
            </Alert>
          )}

          <Button
            id="login-submit"
            type="submit"
            disabled={form.isSubmitting}
            aria-busy={form.isSubmitting}
          >
            {form.isSubmitting ? <Spinner data-icon="inline-start" /> : <ArrowRightIcon data-icon="inline-end" />}
            {form.isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        </CardContent>
      </Card>
    </div>
  );
};
