import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PositionForm, PositionFormValues } from '../components/position-form';
import { organizationApi } from '../organization-api';
import { ErrorState, LoadingState, PageHeader } from '../management-ui';

export const PositionEditPage: React.FC = () => {
  const { id = '' } = useParams();
  const [form, setForm] = useState<PositionFormValues | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => { organizationApi.position(id).then(item => setForm({ code: item.code, name: item.name, level: String(item.level) })).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);

  return <main>
    <PageHeader title="Sửa chức danh" />
    {loading ? <LoadingState /> : error && !form ? <ErrorState error={error} /> : form ? <>
      <PositionForm initialValues={form} submitLabel="Lưu" onSubmit={async payload => {
        await organizationApi.updatePosition(id, payload);
        setSuccess('Đã cập nhật chức danh.');
      }} />
      {success && <p role="status">{success}</p>}
      <Link to="/management/positions">Quay lại</Link>
    </> : null}
  </main>;
};
