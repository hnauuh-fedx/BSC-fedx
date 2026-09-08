import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, RotateCcwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { organizationApi } from '../organization-api';
import type { User, UserFilterOptions } from '../organization-api';
import { ConfirmButton, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, StatusBadge } from '../management-ui';

const ALL = 'ALL';

export const UsersPage: React.FC = () => {
  const [items, setItems] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [positionId, setPositionId] = useState(ALL);
  const [directManagerId, setDirectManagerId] = useState(ALL);
  const [filterOptions, setFilterOptions] = useState<UserFilterOptions>({ departments: [], positions: [], directManagers: [] });
  const [filterOptionsError, setFilterOptionsError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    organizationApi.users({
      search: search.trim(),
      status: status === ALL ? '' : status,
      departmentId: departmentId === ALL ? '' : departmentId,
      positionId: positionId === ALL ? '' : positionId,
      directManagerId: directManagerId === ALL ? '' : directManagerId,
      page,
      limit: 20,
      sortBy: 'full_name',
      sortOrder: 'asc',
    }).then(result => {
      if (requestId !== requestSequence.current) return;
      setItems(result.items);
      setTotal(result.total);
    }).catch(cause => {
      if (requestId === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Không thể tải người dùng.');
    }).finally(() => {
      if (requestId === requestSequence.current) setLoading(false);
    });
  }, [search, status, departmentId, positionId, directManagerId, page]);
  const latestLoad = useRef(load);
  latestLoad.current = load;

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    organizationApi.userFilterOptions()
      .then(setFilterOptions)
      .catch(cause => setFilterOptionsError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu bộ lọc.'));
  }, []);

  const resetFilters = () => {
    setSearch('');
    setStatus(ALL);
    setDepartmentId(ALL);
    setPositionId(ALL);
    setDirectManagerId(ALL);
    setPage(1);
  };
  const hasActiveFilters = Boolean(search.trim()) || status !== ALL || departmentId !== ALL || positionId !== ALL || directManagerId !== ALL;

  const action = (id: string, nextAction: 'activate' | 'deactivate' | 'lock' | 'unlock') => {
    void organizationApi.userStatus(id, nextAction).then(() => latestLoad.current()).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể cập nhật người dùng.'));
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
      <CardHeader><CardTitle>Bộ lọc</CardTitle><CardDescription>Tìm và lọc người dùng theo tổ chức, quản lý trực tiếp hoặc trạng thái tài khoản.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {filterOptionsError && <Alert variant="destructive"><AlertTitle>Không thể tải đầy đủ bộ lọc</AlertTitle><AlertDescription>{filterOptionsError}</AlertDescription></Alert>}
        <FieldGroup className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SearchInput label="Tìm người dùng" value={search} onChange={value => { setSearch(value); setPage(1); }}/>
        <Field><FieldLabel htmlFor="user-department">Đơn vị</FieldLabel>
          <Select value={departmentId} onValueChange={value => { setDepartmentId(value); setPage(1); }}>
            <SelectTrigger id="user-department" className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>Tất cả đơn vị</SelectItem>
              {filterOptions.departments.map(item => <SelectItem key={item.id} value={item.id}>{item.name}{item.status === 'ACTIVE' ? '' : ' (không hoạt động)'}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel htmlFor="user-position">Chức danh</FieldLabel>
          <Select value={positionId} onValueChange={value => { setPositionId(value); setPage(1); }}>
            <SelectTrigger id="user-position" className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>Tất cả chức danh</SelectItem>
              {filterOptions.positions.map(item => <SelectItem key={item.id} value={item.id}>{item.name}{item.status === 'ACTIVE' ? '' : ' (không hoạt động)'}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel htmlFor="user-manager">Quản lý trực tiếp</FieldLabel>
          <Select value={directManagerId} onValueChange={value => { setDirectManagerId(value); setPage(1); }}>
            <SelectTrigger id="user-manager" className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>Tất cả quản lý</SelectItem>
              {filterOptions.directManagers.map(item => <SelectItem key={item.id} value={item.id}>{item.full_name} ({item.employee_code}){item.status === 'ACTIVE' ? '' : ' — không hoạt động'}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel htmlFor="user-status">Trạng thái</FieldLabel>
          <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}>
            <SelectTrigger id="user-status" className="w-full"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>Tất cả</SelectItem><SelectItem value="ACTIVE">Đang hoạt động</SelectItem>
              <SelectItem value="INACTIVE">Ngừng hoạt động</SelectItem><SelectItem value="LOCKED">Đã khóa</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </Field>
      </FieldGroup>
        <div className="flex justify-end"><Button type="button" variant="outline" disabled={!hasActiveFilters} onClick={resetFilters}>
          <RotateCcwIcon data-icon="inline-start"/>Đặt lại bộ lọc
        </Button></div>
      </CardContent>
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
