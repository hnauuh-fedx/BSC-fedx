import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { organizationApi, Department } from '../organization-api';
import { ErrorState, FormField, LoadingState, PageHeader } from '../management-ui';

export const DepartmentEditPage: React.FC = () => {
  const { id = '' } = useParams();
  const [tree, setTree] = useState<Department[]>([]);
  const [form, setForm] = useState({ code: '', name: '', parentId: '' });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => { Promise.all([organizationApi.department(id), organizationApi.departmentTree()]).then(([item, nodes]) => { setForm({ code: item.code, name: item.name, parentId: item.parent_id ?? '' }); setTree(nodes); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  const save = async () => { if (!form.code.trim() || !form.name.trim()) return setError('Mã và tên là bắt buộc.'); setError(''); setSuccess(''); try { await organizationApi.updateDepartment(id, { code: form.code.toUpperCase(), name: form.name, parentId: form.parentId || null }); setSuccess('Đã cập nhật đơn vị.'); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể cập nhật đơn vị.'); } };
  return <main><PageHeader title="Sửa đơn vị" />{loading ? <LoadingState /> : <><FormField label="Mã"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="Tên"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField><FormField label="Đơn vị cha"><select value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}><option value="">Không có</option>{tree.filter(node => node.id !== id && node.status === 'ACTIVE').map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select></FormField>{error && <ErrorState error={error} />}{success && <p role="status">{success}</p>}<button onClick={() => void save()}>Lưu</button> <Link to="/management/departments">Quay lại</Link></>}</main>;
};
