import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { Department, organizationApi } from '../organization-api';
import { ConfirmButton, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, StatusBadge } from '../management-ui';

const ALL = 'ALL';
const NONE = 'NONE';

export const DepartmentsPage: React.FC = () => {
  const [items, setItems] = useState<Department[]>([]);
  const [tree, setTree] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ code: '', name: '', parentId: NONE });

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      organizationApi.departments({ search, status: status === ALL ? '' : status, page, limit: 20 }),
      organizationApi.departmentTree(),
    ]).then(([result, nodes]) => {
      setItems(result.items);
      setTotal(result.total);
      setTree(nodes);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách đơn vị.'))
      .finally(() => setLoading(false));
  }, [search, status, page]);
  useEffect(() => { load(); }, [load]);

  const invalid = !form.code.trim() || !form.name.trim();
  const create = async () => {
    if (invalid) {
      setError('Mã và tên là bắt buộc.');
      return;
    }
    try {
      await organizationApi.createDepartment({
        code: form.code.toUpperCase(),
        name: form.name,
        parentId: form.parentId === NONE ? null : form.parentId,
      });
      setForm({ code: '', name: '', parentId: NONE });
      setSuccess('Đã tạo đơn vị.');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo đơn vị.');
    }
  };

  const statusAction = (item: Department) => <PermissionGate permission="department.manage">
    <ConfirmButton className="min-h-11 w-full md:min-h-0 md:w-auto" message="Xác nhận thay đổi trạng thái?" onConfirm={() => void organizationApi.departmentStatus(item.id, item.status !== 'ACTIVE').then(load).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể cập nhật đơn vị.'))}>
      {item.status === 'ACTIVE' ? 'Ngừng' : 'Kích hoạt'}
    </ConfirmButton>
  </PermissionGate>;

  return <main className="flex flex-col gap-5">
    <PageHeader title="Đơn vị" description="Quản lý cấu trúc đơn vị và quan hệ đơn vị cha trong tổ chức."/>
    <PermissionGate permission="department.manage">
      <Card>
        <CardHeader><CardTitle><h2>Thêm đơn vị</h2></CardTitle><CardDescription>Tạo đơn vị mới và đặt đúng vị trí trong cây tổ chức.</CardDescription></CardHeader>
        <CardContent><FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field data-invalid={!form.code.trim()}><FieldLabel htmlFor="department-code">Mã</FieldLabel><Input id="department-code" aria-invalid={!form.code.trim()} value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })}/>{!form.code.trim() && <FieldDescription>Bắt buộc.</FieldDescription>}</Field>
          <Field data-invalid={!form.name.trim()}><FieldLabel htmlFor="department-name">Tên</FieldLabel><Input id="department-name" aria-invalid={!form.name.trim()} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/>{!form.name.trim() && <FieldDescription>Bắt buộc.</FieldDescription>}</Field>
          <Field><FieldLabel htmlFor="department-parent">Đơn vị cha</FieldLabel>
            <Select value={form.parentId} onValueChange={value => setForm({ ...form, parentId: value })}>
              <SelectTrigger id="department-parent"><SelectValue/></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value={NONE}>Không có</SelectItem>{tree.filter(item => item.status === 'ACTIVE').map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
        </FieldGroup></CardContent>
        <CardFooter><Button className="min-h-11 w-full md:min-h-0 md:w-auto" disabled={invalid} onClick={() => void create()}>Tạo đơn vị</Button></CardFooter>
      </Card>
    </PermissionGate>
    {success && <Alert><AlertTitle>Thành công</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle><h2>Danh sách đơn vị</h2></CardTitle><CardDescription>Tìm kiếm và lọc theo trạng thái hoạt động.</CardDescription></CardHeader>
      <CardContent><FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
        <Field><FieldLabel htmlFor="department-status">Trạng thái</FieldLabel>
          <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}>
            <SelectTrigger id="department-status"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value={ALL}>Tất cả</SelectItem><SelectItem value="ACTIVE">Đang hoạt động</SelectItem><SelectItem value="INACTIVE">Ngừng hoạt động</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
      </FieldGroup></CardContent>
    </Card>
    {loading ? <LoadingState/> : error ? <ErrorState error={error}/> : items.length === 0 ? <EmptyState/> : <>
      <div className="flex flex-col gap-3 md:hidden">{items.map(item => <Card key={item.id}>
        <CardHeader><CardTitle>{item.name}</CardTitle><CardDescription>{item.code}</CardDescription></CardHeader>
        <CardContent><dl><dt>Đơn vị cha</dt><dd>{item.departments?.name ?? '—'}</dd><dt>Trạng thái</dt><dd><StatusBadge status={item.status}/></dd></dl></CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2"><PermissionGate permission="department.manage"><Button className="min-h-11 w-full" variant="outline" asChild><Link to={`/management/departments/${item.id}/edit`}>Sửa</Link></Button>{statusAction(item)}</PermissionGate></CardFooter>
      </Card>)}</div>
      <Card className="hidden md:flex">
        <CardHeader><CardTitle>Kết quả tra cứu</CardTitle><CardDescription>{total} đơn vị phù hợp.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên</TableHead><TableHead>Đơn vị cha</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
          <TableBody>{items.map(item => <TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.departments?.name ?? '—'}</TableCell><TableCell><StatusBadge status={item.status}/></TableCell><TableCell><PermissionGate permission="department.manage"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" asChild><Link to={`/management/departments/${item.id}/edit`}>Sửa</Link></Button>{statusAction(item)}</div></PermissionGate></TableCell></TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </>}
    <Pagination page={page} total={total} limit={20} onChange={setPage}/>
  </main>;
};
