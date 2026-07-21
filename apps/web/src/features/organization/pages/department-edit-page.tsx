import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { organizationApi, Department, User } from '../organization-api';
import { ErrorState, LoadingState, PageHeader } from '../management-ui';

export const DepartmentEditPage: React.FC = () => {
  const { id = '' } = useParams();
  const [tree, setTree] = useState<Department[]>([]), [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ code: '', name: '', parentId: '' });
  const [managerId, setManagerId] = useState(''), [managerReason, setManagerReason] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => { Promise.all([organizationApi.department(id), organizationApi.departmentTree(), organizationApi.users({ departmentId: id, status: 'ACTIVE', limit: 100 }), organizationApi.departmentManager(id)])
    .then(([item, nodes, userPage, assignment]) => { setForm({ code: item.code, name: item.name, parentId: item.parent_id ?? '' }); setTree(nodes); setUsers(userPage.items); setManagerId(assignment?.manager_id ?? ''); })
    .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải đơn vị.')).finally(() => setLoading(false)); }, [id]);
  const save = async () => { if (!form.code.trim() || !form.name.trim()) return setError('Mã và tên là bắt buộc.'); setSaving(true); setError(''); setSuccess(''); try { await organizationApi.updateDepartment(id, { code: form.code.toUpperCase(), name: form.name, parentId: form.parentId || null }); setSuccess('Đã cập nhật đơn vị.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật đơn vị.'); } finally { setSaving(false); } };
  const saveManager = async () => { if (!managerId || !managerReason.trim()) return setError('Phải chọn trưởng phòng và nhập lý do phân công.'); setSaving(true); setError(''); setSuccess(''); try { await organizationApi.setDepartmentManager(id, managerId, managerReason); setSuccess('Đã cập nhật trưởng phòng phụ trách BSC.'); setManagerReason(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể phân công trưởng phòng.'); } finally { setSaving(false); } };
  return <main className="flex flex-col gap-6"><PageHeader title="Sửa đơn vị" breadcrumb={<Link to="/management/departments">Danh sách đơn vị</Link>}/>{loading ? <LoadingState/> : <>
    {error && <ErrorState error={error}/>} {success && <p role="status">{success}</p>}
    <Card><CardHeader><CardTitle>Thông tin đơn vị</CardTitle><CardDescription>Cập nhật mã, tên và vị trí trong cây tổ chức.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="department-code">Mã</FieldLabel><Input id="department-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}/></Field><Field><FieldLabel htmlFor="department-name">Tên</FieldLabel><Input id="department-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field><FieldLabel htmlFor="parent-department">Đơn vị cha</FieldLabel><Select value={form.parentId || 'NONE'} onValueChange={(value) => setForm({ ...form, parentId: value === 'NONE' ? '' : value })}><SelectTrigger id="parent-department"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="NONE">Không có</SelectItem>{tree.filter((node) => node.id !== id && node.status === 'ACTIVE').map((node) => <SelectItem key={node.id} value={node.id}>{node.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup></CardContent><CardFooter className="justify-end"><Button disabled={saving} onClick={() => void save()}>Lưu đơn vị</Button></CardFooter></Card>
    <Card><CardHeader><CardTitle>Trưởng phòng phụ trách BSC</CardTitle><CardDescription>Chỉ người được phân công đang hiệu lực mới được tạo, sửa và nộp BSC phòng ban.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="department-manager">Trưởng phòng</FieldLabel><Select value={managerId} onValueChange={setManagerId}><SelectTrigger id="department-manager"><SelectValue placeholder="Chọn người phụ trách"/></SelectTrigger><SelectContent><SelectGroup>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name} — {user.employee_code}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="manager-reason">Lý do phân công/thay đổi</FieldLabel><Textarea id="manager-reason" value={managerReason} onChange={(event) => setManagerReason(event.target.value)} placeholder="Bắt buộc để ghi audit log"/></Field></FieldGroup></CardContent><CardFooter className="justify-end"><Button disabled={saving || !managerId || !managerReason.trim()} onClick={() => void saveManager()}>Lưu trưởng phòng</Button></CardFooter></Card>
    <Button asChild variant="outline"><Link to="/management/departments">Quay lại danh sách</Link></Button>
  </>}</main>;
};
