import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BriefcaseBusiness, Building2, CheckCircle2, KeyRound, Mail, UserRound, UserRoundCog } from 'lucide-react';
import { PermissionGate } from '../../auth/components/permission-gate';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldDescription, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Spinner } from '../../../components/ui/spinner';
import { organizationApi, User } from '../organization-api';
import { ConfirmButton, ErrorState, LoadingState, PageHeader, StatusBadge } from '../management-ui';

const DetailItem: React.FC<React.PropsWithChildren<{ icon: React.ReactNode; label: string }>> = ({ icon, label, children }) => <div className="flex gap-3 rounded-lg border bg-muted/20 p-4">
  <span className="mt-0.5 text-muted-foreground" aria-hidden="true">{icon}</span>
  <div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="break-words font-medium">{children}</p></div>
</div>;

export const UserDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const [user, setUser] = useState<User | null>(null), [error, setError] = useState(''), [success, setSuccess] = useState(''), [password, setPassword] = useState('');
  const [processing, setProcessing] = useState(false);
  const load = useCallback(() => { organizationApi.user(id).then(setUser).catch(e => setError(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);
  const status = async (action: 'activate' | 'deactivate' | 'lock' | 'unlock') => {
    setProcessing(true); setError(''); setSuccess('');
    try { await organizationApi.userStatus(id, action); setSuccess('Đã cập nhật trạng thái người dùng.'); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể cập nhật trạng thái.'); }
    finally { setProcessing(false); }
  };
  const reset = async () => {
    if (password.length < 6) return setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
    setProcessing(true); setError(''); setSuccess('');
    try { await organizationApi.resetPassword(id, password); setPassword(''); setSuccess('Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể đặt lại mật khẩu.'); }
    finally { setProcessing(false); }
  };
  if (!user && !error) return <LoadingState />;
  if (!user) return <ErrorState error={error} />;

  return <main className="flex flex-col gap-6">
    <PageHeader title={user.full_name} description={`${user.employee_code} · @${user.username}`} breadcrumb={<Link to="/management/users">Danh sách người dùng</Link>} action={<PermissionGate permission="user.update"><Button asChild><Link to={`/management/users/${user.id}/edit`}>Chỉnh sửa</Link></Button></PermissionGate>}>
      <div className="mt-3"><StatusBadge status={user.status} /></div>
    </PageHeader>
    {error && <ErrorState error={error} />}
    {success && <Alert><CheckCircle2 /><AlertTitle>Thao tác thành công</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}

    <Card>
      <CardHeader><CardTitle>Hồ sơ người dùng</CardTitle><CardDescription>Thông tin tài khoản và vị trí trong cơ cấu tổ chức.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <DetailItem icon={<UserRound className="size-5" />} label="Tên đăng nhập">@{user.username}</DetailItem>
        <DetailItem icon={<Mail className="size-5" />} label="Email">{user.email}</DetailItem>
        <DetailItem icon={<Building2 className="size-5" />} label="Đơn vị">{user.departments?.name ?? 'Chưa phân công'}</DetailItem>
        <DetailItem icon={<BriefcaseBusiness className="size-5" />} label="Chức danh">{user.positions?.name ?? 'Chưa phân công'}</DetailItem>
        <DetailItem icon={<UserRoundCog className="size-5" />} label="Quản lý trực tiếp">{user.users?.full_name ?? 'Không có'}</DetailItem>
      </CardContent>
    </Card>

    <PermissionGate permission="user.lock">
      <Card>
        <CardHeader><CardTitle>Trạng thái tài khoản</CardTitle><CardDescription>Khóa hoặc ngừng hoạt động sẽ hạn chế quyền truy cập của người dùng.</CardDescription></CardHeader>
        <CardFooter className="flex-wrap gap-3">
          {user.status === 'ACTIVE' ? <>
            <ConfirmButton className="min-h-11 w-full sm:min-h-8 sm:w-auto" message="Khóa người dùng?" description="Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa." onConfirm={() => void status('lock')} disabled={processing}>Khóa tài khoản</ConfirmButton>
            <ConfirmButton className="min-h-11 w-full sm:min-h-8 sm:w-auto" message="Ngừng hoạt động người dùng?" onConfirm={() => void status('deactivate')} disabled={processing}>Ngừng hoạt động</ConfirmButton>
          </> : <ConfirmButton className="min-h-11 w-full sm:min-h-8 sm:w-auto" message="Kích hoạt người dùng?" onConfirm={() => void status(user.status === 'LOCKED' ? 'unlock' : 'activate')} disabled={processing}>Kích hoạt / Mở khóa</ConfirmButton>}
        </CardFooter>
      </Card>
    </PermissionGate>

    <PermissionGate permission="user.password.reset">
      <Card>
        <CardHeader><CardTitle>Đặt lại mật khẩu</CardTitle><CardDescription>Mọi phiên đăng nhập hiện tại sẽ bị thu hồi sau khi đặt lại.</CardDescription></CardHeader>
        <CardContent><Field><FieldLabel htmlFor="new-password">Mật khẩu mới</FieldLabel><Input id="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} autoComplete="new-password" disabled={processing} /><FieldDescription>Tối thiểu 6 ký tự.</FieldDescription></Field></CardContent>
        <CardFooter className="justify-end"><Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" onClick={() => void reset()} disabled={processing || password.length < 6}>{processing ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}Đặt lại mật khẩu</Button></CardFooter>
      </Card>
    </PermissionGate>
  </main>;
};
