import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Department, organizationApi, Position, User } from '../organization-api';
import { ErrorState, FormField, LoadingState, PageHeader } from '../management-ui';

export const UserFormPage: React.FC = () => {
  const { id } = useParams(), navigate = useNavigate(), edit = Boolean(id);
  const [form, setForm] = useState({ employeeCode: '', fullName: '', email: '', password: '', departmentId: '', positionId: '', directManagerId: '' });
  const [departments, setDepartments] = useState<Department[]>([]), [positions, setPositions] = useState<Position[]>([]), [managers, setManagers] = useState<User[]>([]);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    const requests: Promise<unknown>[] = [
      organizationApi.departmentTree().then(setDepartments),
      organizationApi.positions({ status: 'ACTIVE', page: 1, limit: 100 }).then(result => setPositions(result.items)),
      organizationApi.users({ status: 'ACTIVE', page: 1, limit: 100 }).then(result => setManagers(result.items.filter(user => user.id !== id))),
    ];
    if (id) requests.push(organizationApi.user(id).then(user => setForm({ employeeCode: user.employee_code, fullName: user.full_name, email: user.email, password: '', departmentId: user.department_id, positionId: user.position_id, directManagerId: user.direct_manager_id ?? '' })));
    Promise.all(requests).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [id]);
  const save = async () => {
    if (!form.fullName.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || (!edit && (!form.employeeCode.trim() || form.password.length < 12)) || !form.departmentId || !form.positionId) return setError('Vui lòng nhập đầy đủ dữ liệu hợp lệ; mật khẩu tối thiểu 12 ký tự.');
    try {
      const common = { fullName: form.fullName, email: form.email, departmentId: form.departmentId, positionId: form.positionId, directManagerId: form.directManagerId || null };
      if (edit) await organizationApi.updateUser(id!, common); else await organizationApi.createUser({ ...common, employeeCode: form.employeeCode, password: form.password });
      navigate('/management/users');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu người dùng.'); }
  };
  return <main><PageHeader title={edit ? 'Sửa người dùng' : 'Tạo người dùng'} />{loading ? <LoadingState /> : <>{!edit && <FormField label="Mã nhân viên"><input value={form.employeeCode} onChange={e => setForm({ ...form, employeeCode: e.target.value })} /></FormField>}<FormField label="Họ tên"><input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></FormField><FormField label="Email"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></FormField>{!edit && <FormField label="Mật khẩu ban đầu"><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></FormField>}<FormField label="Đơn vị"><select value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}><option value="">Chọn đơn vị</option>{departments.filter(item => item.status === 'ACTIVE').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Chức danh"><select value={form.positionId} onChange={e => setForm({ ...form, positionId: e.target.value })}><option value="">Chọn chức danh</option>{positions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Quản lý trực tiếp"><select value={form.directManagerId} onChange={e => setForm({ ...form, directManagerId: e.target.value })}><option value="">Không có</option>{managers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></FormField>{error && <ErrorState error={error} />}<button onClick={() => void save()}>Lưu</button> <Link to="/management/users">Hủy</Link></>}</main>;
};
