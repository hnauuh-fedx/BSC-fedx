import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { organizationApi, User } from '../organization-api';
import { ConfirmButton, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, StatusBadge } from '../management-ui';

const ALL = 'ALL';

export const UsersPage: React.FC = () => {
  const [items, setItems] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    organizationApi.users({
      search,
      status: status === ALL ? '' : status,
      page,
      limit: 20,
      sortBy: 'full_name',
      sortOrder: 'asc',
    }).then(result => {
      setItems(result.items);
      setTotal(result.total);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải người dùng.'))
      .finally(() => setLoading(false));
  }, [search, status, page]);

  useEffect(() => { load(); }, [load]);

  const action = (id: string, nextAction: 'activate' | 'deactivate' | 'lock' | 'unlock') => {
    void organizationApi.userStatus(id, nextAction).then(load).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể cập nhật người dùng.'));
  };

  const actions = (user: User) => <PermissionGate permission="user.lock">
    <div className="flex flex-wrap gap-2">
      {user.status === 'ACTIVE' ? <>
        <ConfirmButton className="min-h-11 w-full md:min-h-0 md:w-auto" message="Khóa người dùng?" onConfirm={() => action(user.id, 'lock')}>Khóa</ConfirmButton>
        <ConfirmButton className="min-h-11 w-full md:min-h-0 md:w-auto" message="Ngừng hoạt động người dùng?" onConfirm={() => action(user.id, 'deactivate')}>Ngừng</ConfirmButton>
      </> : <ConfirmButton className="min-h-11 w-full md:min-h-0 md:w-auto" message="Kích hoạt người dùng?" onConfirm={() => action(user.id, user.status === 'LOCKED' ? 'unlock' : 'activate')}>Mở</ConfirmButton>}
    </div>
  </PermissionGate>;

  return <main className="flex flex-col gap-5">
    <PageHeader
      title="Người dùng"
      description="Quản lý tài khoản, trạng thái và thông tin tổ chức của người dùng."
      action={<PermissionGate allOf={['user.create', 'permission.assign']}><Button className="min-h-11 w-full md:min-h-0 md:w-auto" asChild><Link to="/management/users/new"><PlusIcon data-icon="inline-start"/>Tạo người dùng</Link></Button></PermissionGate>}
    />
    <Card>
      <CardHeader><CardTitle>Bộ lọc</CardTitle><CardDescription>Tìm theo tên, mã hoặc trạng thái tài khoản.</CardDescription></CardHeader>
      <CardContent><FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
        <Field><FieldLabel htmlFor="user-status">Trạng thái</FieldLabel>
          <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}>
            <SelectTrigger id="user-status"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>Tất cả</SelectItem><SelectItem value="ACTIVE">Đang hoạt động</SelectItem>
              <SelectItem value="INACTIVE">Ngừng hoạt động</SelectItem><SelectItem value="LOCKED">Đã khóa</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </Field>
      </FieldGroup></CardContent>
    </Card>
    {loading ? <LoadingState/> : error ? <ErrorState error={error}/> : items.length === 0 ? <EmptyState/> : <>
      <div className="flex flex-col gap-3 md:hidden">{items.map(user => <Card key={user.id}>
        <CardHeader><CardTitle><Link to={`/management/users/${user.id}`}>{user.full_name}</Link></CardTitle><CardDescription>{user.employee_code} · {user.username}</CardDescription></CardHeader>
        <CardContent><dl><dt>Email</dt><dd>{user.email}</dd><dt>Đơn vị</dt><dd>{user.departments?.name ?? '—'}</dd><dt>Chức danh</dt><dd>{user.positions?.name ?? '—'}</dd><dt>Trạng thái</dt><dd><StatusBadge status={user.status}/></dd></dl></CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2">{actions(user)}</CardFooter>
      </Card>)}</div>
      <Card className="hidden md:flex">
        <CardHeader><CardTitle>Danh sách người dùng</CardTitle><CardDescription>{total} tài khoản phù hợp.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên đăng nhập</TableHead><TableHead>Họ tên</TableHead><TableHead>Email</TableHead><TableHead>Đơn vị</TableHead><TableHead>Chức danh</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
          <TableBody>{items.map(user => <TableRow key={user.id}><TableCell>{user.employee_code}</TableCell><TableCell>{user.username}</TableCell><TableCell><Link to={`/management/users/${user.id}`}>{user.full_name}</Link></TableCell><TableCell>{user.email}</TableCell><TableCell>{user.departments?.name ?? '—'}</TableCell><TableCell>{user.positions?.name ?? '—'}</TableCell><TableCell><StatusBadge status={user.status}/></TableCell><TableCell><div className="flex justify-end">{actions(user)}</div></TableCell></TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </>}
    <Pagination page={page} total={total} limit={20} onChange={setPage}/>
  </main>;
};
