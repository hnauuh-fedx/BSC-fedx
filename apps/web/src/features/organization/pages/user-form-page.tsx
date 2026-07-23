import React, { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Spinner } from '../../../components/ui/spinner';
import { rolesApi } from '../../roles/services/roles.service';
import type { RoleDetail, RoleSummary } from '../../roles/types/roles.types';
import { Department, organizationApi, Position, User } from '../organization-api';
import { ErrorState, FormField, LoadingState, PageHeader } from '../management-ui';

type RoleScopeType = 'GLOBAL' | 'DEPARTMENT' | 'SELF';

const EMPTY_FORM = {
  employeeCode: '', username: '', fullName: '', email: '', password: '', departmentId: '', positionId: '', directManagerId: '', roleId: '', roleScopeType: 'SELF' as RoleScopeType,
};

function SelectField({ label, value, placeholder, disabled, helper, onChange, children }: React.PropsWithChildren<{
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  helper?: string;
  onChange: (value: string) => void;
}>) {
  const id = useId();
  return <div className="field">
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-labelledby={`${id}-label`} aria-describedby={helper ? `${id}-helper` : undefined} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent><SelectGroup>{children}</SelectGroup></SelectContent>
    </Select>
    {helper && <small id={`${id}-helper`} className="field-helper">{helper}</small>}
  </div>;
}

export const UserFormPage: React.FC = () => {
  const { id } = useParams(), navigate = useNavigate(), edit = Boolean(id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [departments, setDepartments] = useState<Department[]>([]), [positions, setPositions] = useState<Position[]>([]), [managers, setManagers] = useState<User[]>([]), [roles, setRoles] = useState<RoleSummary[]>([]);
  const [roleDetail, setRoleDetail] = useState<RoleDetail | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [departmentResult, positionResult, managerResult, roleResult, userResult] = await Promise.allSettled([
        organizationApi.departmentTree(),
        organizationApi.positions({ status: 'ACTIVE', page: 1, limit: 100 }),
        organizationApi.users({ status: 'ACTIVE', page: 1, limit: 100 }),
        edit ? Promise.resolve(null) : rolesApi.list(),
        id ? organizationApi.user(id) : Promise.resolve(null),
      ]);
      if (!active) return;
      if (departmentResult.status === 'fulfilled') setDepartments(departmentResult.value);
      if (positionResult.status === 'fulfilled') setPositions(positionResult.value.items);
      if (managerResult.status === 'fulfilled') setManagers(managerResult.value.items.filter(user => user.id !== id));
      if (!edit && roleResult.status === 'fulfilled' && roleResult.value) setRoles(roleResult.value.filter(role => role.status === 'ACTIVE'));
      if (edit && userResult.status === 'fulfilled' && userResult.value) {
        const user = userResult.value;
        setForm(current => ({ ...current, employeeCode: user.employee_code, username: user.username, fullName: user.full_name, email: user.email, departmentId: user.department_id, positionId: user.position_id, directManagerId: user.direct_manager_id ?? '' }));
      }
      const rejected = [departmentResult, positionResult, managerResult, roleResult, userResult].find(result => result.status === 'rejected');
      if (rejected?.status === 'rejected') setError(rejected.reason instanceof Error ? rejected.reason.message : 'Không thể tải đầy đủ dữ liệu biểu mẫu.');
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [edit, id]);

  useEffect(() => {
    let active = true;
    setRoleDetail(null);
    if (!form.roleId || edit) return () => { active = false; };
    rolesApi.detail(form.roleId)
      .then(detail => { if (active) setRoleDetail(detail); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách quyền của vai trò.'); });
    return () => { active = false; };
  }, [edit, form.roleId]);

  const selectedRole = roles.find(role => role.id === form.roleId);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(form.username) || !form.fullName.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || (!edit && (!form.employeeCode.trim() || form.password.length < 12 || !form.roleId)) || !form.departmentId || !form.positionId) {
      setError('Vui lòng nhập đầy đủ dữ liệu hợp lệ; mật khẩu tối thiểu 12 ký tự và phải chọn vai trò.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const common = { username: form.username, fullName: form.fullName, email: form.email, departmentId: form.departmentId, positionId: form.positionId, directManagerId: form.directManagerId || null };
      if (edit) await organizationApi.updateUser(id!, common);
      else await organizationApi.createUser({ ...common, employeeCode: form.employeeCode, password: form.password, roleId: form.roleId, roleScopeType: form.roleScopeType });
      navigate('/management/users');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu người dùng.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="flex flex-col gap-6">
    <PageHeader title={edit ? 'Sửa người dùng' : 'Tạo người dùng'} description={edit ? 'Cập nhật thông tin tổ chức của người dùng.' : 'Tạo tài khoản và gán vai trò, phạm vi quyền ngay trong một bước.'} />
    {loading ? <LoadingState /> : <form className="flex flex-col gap-6" onSubmit={event => void save(event)} noValidate>
      <Card>
        <CardHeader><CardTitle><h2>Thông tin người dùng</h2></CardTitle><CardDescription>Thông tin nhận diện và đăng nhập của tài khoản.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {!edit && <FormField label="Mã nhân viên"><Input value={form.employeeCode} onChange={event => setForm({ ...form, employeeCode: event.target.value })} disabled={submitting} /></FormField>}
          <FormField label="Tên đăng nhập"><Input value={form.username} onChange={event => setForm({ ...form, username: event.target.value.toLowerCase() })} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" disabled={submitting} /></FormField>
          <FormField label="Họ tên"><Input value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} disabled={submitting} /></FormField>
          <FormField label="Email"><Input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} disabled={submitting} /></FormField>
          {!edit && <FormField label="Mật khẩu ban đầu"><Input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} disabled={submitting} /></FormField>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><h2>Cơ cấu tổ chức</h2></CardTitle><CardDescription>Đơn vị, chức danh và tuyến quản lý trực tiếp của người dùng.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FormField label="Đơn vị"><select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })} disabled={submitting}><option value="">Chọn đơn vị</option>{departments.filter(item => item.status === 'ACTIVE').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
          <SelectField label="Chức danh" value={form.positionId} placeholder="Chọn chức danh" onChange={value => setForm({ ...form, positionId: value })} disabled={submitting} helper={positions.length ? `${positions.length} chức danh đang hoạt động.` : 'Chưa có chức danh đang hoạt động. Hãy tạo hoặc kích hoạt chức danh trước.'}>
            {positions.map(item => <SelectItem key={item.id} value={item.id} title={`${item.code} · Thứ bậc ${item.level}`}>{item.name}</SelectItem>)}
          </SelectField>
          <SelectField label="Quản lý trực tiếp" value={form.directManagerId || 'NONE'} placeholder="Chọn quản lý trực tiếp" onChange={value => setForm({ ...form, directManagerId: value === 'NONE' ? '' : value })} disabled={submitting}>
            <SelectItem value="NONE">Không có</SelectItem>
            {managers.map(item => <SelectItem key={item.id} value={item.id}>{item.full_name}</SelectItem>)}
          </SelectField>
        </CardContent>
      </Card>

      {!edit && <Card>
        <CardHeader><CardTitle><h2>Vai trò &amp; Quyền</h2></CardTitle><CardDescription>Quyền được kế thừa từ vai trò đã chọn và được giới hạn theo phạm vi dữ liệu.</CardDescription></CardHeader>
        <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Vai trò" value={form.roleId} placeholder="Chọn vai trò" onChange={value => {
            const role = roles.find(item => item.id === value);
            setForm({ ...form, roleId: value, roleScopeType: role?.code === 'DIRECTOR' ? 'GLOBAL' : form.roleScopeType });
          }} disabled={submitting} helper={roles.length ? `${roles.length} vai trò đang hoạt động.` : 'Không có vai trò khả dụng hoặc tài khoản chưa có quyền xem vai trò.'}>
            {roles.map(role => <SelectItem key={role.id} value={role.id} title={role.description ?? `${role.permissionCount} quyền`}>{role.name} ({role.code})</SelectItem>)}
          </SelectField>
          <SelectField label="Phạm vi quyền" value={form.roleScopeType} placeholder="Chọn phạm vi" onChange={value => setForm({ ...form, roleScopeType: value as RoleScopeType })} disabled={submitting || selectedRole?.code === 'DIRECTOR'} helper={selectedRole?.code === 'DIRECTOR' ? 'Giám đốc xem BSC của trưởng phòng và nhân viên trên toàn hệ thống.' : undefined}>
            <SelectItem value="SELF" title="Chỉ dữ liệu của chính người dùng">Cá nhân</SelectItem>
            <SelectItem value="DEPARTMENT" title="Dữ liệu trong đơn vị đã chọn">Đơn vị đã chọn</SelectItem>
            <SelectItem value="GLOBAL" title="Dữ liệu toàn hệ thống; backend chỉ cho phép người có phạm vi tương ứng">Toàn hệ thống</SelectItem>
          </SelectField>
        </div>
        {selectedRole && <div className="mt-4 rounded-lg border bg-muted/30 p-4" role="status">
          <p className="text-sm"><strong>{selectedRole.name}</strong> · {selectedRole.permissionCount} quyền{selectedRole.description ? ` · ${selectedRole.description}` : ''}</p>
          {roleDetail && <div className="mt-3 grid gap-3 md:grid-cols-2">
            {roleDetail.permissionsByModule.map(group => <div key={group.module}>
              <h3 className="text-sm font-medium">{group.module}</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                {group.permissions.map(permission => <li key={permission.id}>{permission.name} <span className="text-xs">({permission.code})</span></li>)}
              </ul>
            </div>)}
          </div>}
        </div>}
        </CardContent>
      </Card>}

      {error && <ErrorState error={error} />}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" type="submit" disabled={submitting}>{submitting && <Spinner data-icon="inline-start" />}{submitting ? 'Đang lưu…' : 'Lưu người dùng'}</Button>
        <Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" asChild type="button" variant="outline"><Link to="/management/users">Hủy</Link></Button>
      </div>
    </form>}
  </main>;
};
