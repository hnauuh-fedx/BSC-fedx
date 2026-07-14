import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { organizationApi } from '../organization-api';
import { ErrorState, FormField, LoadingState, PageHeader } from '../management-ui';

export const PositionEditPage: React.FC = () => {
  const { id = '' } = useParams();
  const [form, setForm] = useState({ code: '', name: '', level: '1' });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => { organizationApi.position(id).then(item => setForm({ code: item.code, name: item.name, level: String(item.level) })).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  const save = async () => { const level = Number(form.level); if (!form.code.trim() || !form.name.trim() || !Number.isInteger(level) || level <= 0) return setError('Mã, tên và cấp bậc nguyên dương là bắt buộc.'); setError(''); setSuccess(''); try { await organizationApi.updatePosition(id, { code: form.code.toUpperCase(), name: form.name, level }); setSuccess('Đã cập nhật chức danh.'); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể cập nhật chức danh.'); } };
  return <main><PageHeader title="Sửa chức danh" />{loading ? <LoadingState /> : <><FormField label="Mã"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="Tên"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField><FormField label="Cấp bậc"><input type="number" min="1" value={form.level} onChange={e => setForm({ ...form, level: e.target.value })} /></FormField>{error && <ErrorState error={error} />}{success && <p role="status">{success}</p>}<button onClick={() => void save()}>Lưu</button> <Link to="/management/positions">Quay lại</Link></>}</main>;
};
