import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { PositionForm, PositionFormValues } from '../components/position-form';
import { organizationApi } from '../organization-api';
import { ErrorState, LoadingState, PageHeader } from '../management-ui';

export const PositionEditPage: React.FC = () => {
  const { id = '' } = useParams();
  const [form, setForm] = useState<PositionFormValues | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => { organizationApi.position(id).then(item => setForm({ code: item.code, name: item.name, level: String(item.level) })).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);

  return <main className="flex flex-col gap-6">
    <PageHeader title="Sửa chức danh" description="Cập nhật thông tin và thứ bậc của chức danh trong cơ cấu tổ chức." breadcrumb={<Link to="/management/positions">Danh sách chức danh</Link>} />
    {loading ? <LoadingState /> : error && !form ? <ErrorState error={error} /> : form ? <>
      {success && <Alert><CheckCircle2 /><AlertTitle>Cập nhật thành công</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
      <Card>
        <CardHeader><CardTitle>Thông tin chức danh</CardTitle><CardDescription>Thứ bậc chỉ phục vụ sắp xếp cơ cấu, không tự động cấp quyền hệ thống.</CardDescription></CardHeader>
        <CardContent><PositionForm initialValues={form} submitLabel="Lưu chức danh" onSubmit={async payload => {
          await organizationApi.updatePosition(id, payload);
          setSuccess('Đã cập nhật chức danh.');
        }} /></CardContent>
      </Card>
      <div><Button asChild variant="outline"><Link to="/management/positions">Quay lại danh sách</Link></Button></div>
    </> : null}
  </main>;
};
