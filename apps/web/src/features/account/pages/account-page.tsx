import React, { FormEvent, useEffect, useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '../../../components/ui/avatar';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '../../../components/ui/input-group';
import { ApiError } from '../../../lib/http-client';
import { Spinner } from '../../../components/ui/spinner';
import { useAuth } from '../../auth/hooks/use-auth';
import { accountApi } from '../account-api';

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  description?: string;
  disabled: boolean;
  maxLength?: number;
};

const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  description,
  disabled,
  maxLength,
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      orientation="horizontal"
      className="max-sm:flex-col max-sm:items-stretch"
      data-invalid={Boolean(error)}
      data-disabled={disabled}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          maxLength={maxLength}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
            onClick={() => setVisible((current) => !current)}
            disabled={disabled}
          >
            {visible ? <EyeOffIcon data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
};

function initials(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
}

export const AccountPage: React.FC = () => {
  const { user, clearSession, updateCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [profileError, setProfileError] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [passwordFormError, setPasswordFormError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => setFullName(user?.fullName ?? ''), [user?.fullName]);
  if (!user) return null;

  const normalizedFullName = fullName.trim();
  const profileChanged = normalizedFullName !== user.fullName;
  const profileValid = normalizedFullName.length >= 1 && normalizedFullName.length <= 255;
  const changeFullName = (value: string) => {
    setFullName(value);
    const normalized = value.trim();
    setProfileError(!normalized ? 'Vui lòng nhập họ và tên.' : normalized.length > 255 ? 'Họ và tên không được vượt quá 255 ký tự.' : '');
  };
  const changeCurrentPassword = (value: string) => {
    setCurrentPassword(value);
    setCurrentPasswordError('');
    setPasswordFormError('');
    if (newPassword) setNewPasswordError(newPassword === value ? 'Mật khẩu mới phải khác mật khẩu hiện tại.' : newPassword.length < 12 ? 'Mật khẩu mới phải có ít nhất 12 ký tự.' : '');
  };
  const changeNewPassword = (value: string) => {
    setNewPassword(value);
    setNewPasswordError(value.length < 12 ? 'Mật khẩu mới phải có ít nhất 12 ký tự.' : value === currentPassword ? 'Mật khẩu mới phải khác mật khẩu hiện tại.' : '');
    if (confirmPassword) setConfirmError(confirmPassword === value ? '' : 'Mật khẩu xác nhận không khớp.');
    setPasswordFormError('');
  };
  const changeConfirmPassword = (value: string) => {
    setConfirmPassword(value);
    setConfirmError(value === newPassword ? '' : 'Mật khẩu xác nhận không khớp.');
    setPasswordFormError('');
  };

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileError('');
    if (!normalizedFullName) {
      setProfileError('Vui lòng nhập họ và tên.');
      return;
    }
    if (normalizedFullName.length > 255) {
      setProfileError('Họ và tên không được vượt quá 255 ký tự.');
      return;
    }
    setProfileSubmitting(true);
    try {
      const updated = await accountApi.updateProfile({ fullName: normalizedFullName });
      updateCurrentUser?.(updated);
      setFullName(updated.fullName);
      toast.success('Đã cập nhật thông tin cá nhân.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Không thể cập nhật thông tin cá nhân.');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setCurrentPasswordError('');
    setNewPasswordError('');
    setConfirmError('');
    setPasswordFormError('');
    if (newPassword.length < 12) {
      setNewPasswordError('Mật khẩu mới phải có ít nhất 12 ký tự.');
      return;
    }
    if (newPassword === currentPassword) {
      setNewPasswordError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await accountApi.changePassword({ currentPassword, newPassword });
      toast.success('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      clearSession?.();
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH_CURRENT_PASSWORD_INVALID') {
        setCurrentPasswordError('Mật khẩu hiện tại không chính xác.');
      } else if (error instanceof ApiError && error.code === 'AUTH_NEW_PASSWORD_SAME') {
        setNewPasswordError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      } else if (error instanceof ApiError && error.code === 'AUTH_PASSWORD_POLICY_VIOLATION') {
        setNewPasswordError('Mật khẩu mới phải có từ 12 đến 128 ký tự.');
      } else if (error instanceof ApiError && error.code === 'AUTH_PASSWORD_RATE_LIMITED') {
        setCurrentPasswordError('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.');
      } else {
        setPasswordFormError(error instanceof Error ? error.message : 'Không thể đổi mật khẩu.');
      }
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const roleLabel = user.roles[0]?.code ?? 'TÀI KHOẢN';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Tài khoản</h1>
        <p className="text-muted-foreground">Quản lý thông tin cá nhân và bảo mật tài khoản của bạn.</p>
      </header>

      <form onSubmit={submitProfile} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cá nhân</CardTitle>
            <CardDescription>Tên này được hiển thị trên BSC, báo cáo và lịch sử xử lý.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <Avatar size="lg"><AvatarFallback>{initials(user.fullName)}</AvatarFallback></Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{user.fullName}</p>
                <p className="truncate text-sm text-muted-foreground">{roleLabel} · {user.employeeCode}</p>
              </div>
            </div>
            <FieldGroup>
              <Field
                orientation="horizontal"
                className="max-sm:flex-col max-sm:items-stretch"
                data-invalid={Boolean(profileError)}
                data-disabled={profileSubmitting}
              >
                <FieldLabel htmlFor="account-full-name">Họ và tên</FieldLabel>
                <Input
                  id="account-full-name"
                  value={fullName}
                  onChange={(event) => changeFullName(event.target.value)}
                  autoComplete="name"
                  maxLength={255}
                  aria-invalid={Boolean(profileError)}
                  disabled={profileSubmitting}
                />
                <FieldError>{profileError}</FieldError>
              </Field>
              <Field orientation="horizontal" className="max-sm:flex-col max-sm:items-stretch" data-disabled>
                <FieldLabel htmlFor="account-email">Email</FieldLabel>
                <Input id="account-email" value={user.email} disabled readOnly />
                <FieldDescription>Liên hệ quản trị viên nếu email cần thay đổi.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={!profileChanged || !profileValid || profileSubmitting}>
              {profileSubmitting && <Spinner data-icon="inline-start" />}
              {profileSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <form onSubmit={submitPassword} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Đổi mật khẩu</CardTitle>
            <CardDescription>Sau khi đổi mật khẩu, tất cả phiên đăng nhập sẽ bị thu hồi và bạn cần đăng nhập lại.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <PasswordField id="current-password" label="Mật khẩu hiện tại" value={currentPassword} onChange={changeCurrentPassword} autoComplete="current-password" error={currentPasswordError} disabled={passwordSubmitting} maxLength={128} />
              <PasswordField id="new-password" label="Mật khẩu mới" value={newPassword} onChange={changeNewPassword} autoComplete="new-password" description="Sử dụng từ 12 đến 128 ký tự." error={newPasswordError} disabled={passwordSubmitting} maxLength={128} />
              <PasswordField id="confirm-password" label="Xác nhận mật khẩu mới" value={confirmPassword} onChange={changeConfirmPassword} autoComplete="new-password" error={confirmError} disabled={passwordSubmitting} maxLength={128} />
              <FieldError>{passwordFormError}</FieldError>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={!currentPassword || !newPassword || !confirmPassword || passwordSubmitting}>
              {passwordSubmitting && <Spinner data-icon="inline-start" />}
              {passwordSubmitting ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  );
};
