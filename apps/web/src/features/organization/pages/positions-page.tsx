import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { PositionForm } from '../components/position-form';
import { organizationApi, Position } from '../organization-api';
import { ConfirmButton, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, StatusBadge } from '../management-ui';

const ALL = 'ALL';
const RANK_EXPLANATION = 'Chỉ dùng để sắp xếp chức danh, không đại diện cho quyền hệ thống.';

export const PositionsPage: React.FC = () => {
  const [items, setItems] = useState<Position[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    organizationApi.positions({ search, status: status === ALL ? '' : status, page, limit: 20 })
      .then(result => { setItems(result.items); setTotal(result.total); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải chức danh.'))
      .finally(() => setLoading(false));
  }, [search, status, page]);
  useEffect(() => { load(); }, [load]);

  const statusAction = (item: Position) => <PermissionGate permission="position.manage">
    <ConfirmButton className="min-h-11 w-full md:min-h-0 md:w-auto" message="Xác nhận thay đổi trạng thái?" onConfirm={() => void organizationApi.positionStatus(item.id, item.status !== 'ACTIVE').then(load).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể cập nhật chức danh.'))}>
      {item.status === 'ACTIVE' ? 'Ngừng' : 'Kích hoạt'}
    </ConfirmButton>
  </PermissionGate>;

  return <main className="flex flex-col gap-5">
    <PageHeader title="Quản lý chức danh" description="Thiết lập danh mục chức danh và thứ bậc dùng để sắp xếp trong cơ cấu tổ chức."/>
    <PermissionGate permission="position.manage">
      <Card>
        <CardHeader><CardTitle><h2>Thêm chức danh</h2></CardTitle><CardDescription>Nhập thông tin cơ bản và chọn thứ bậc phù hợp với vị trí trong tổ chức.</CardDescription></CardHeader>
        <CardContent><PositionForm submitLabel="Tạo chức danh" resetOnSuccess onSubmit={async payload => {
          await organizationApi.createPosition(payload);
          setSuccess('Đã tạo chức danh.');
          load();
        }}/></CardContent>
      </Card>
    </PermissionGate>
    {success && <Alert><AlertTitle>Thành công</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle><h2>Danh sách chức danh</h2></CardTitle><CardDescription>Tìm kiếm và lọc theo trạng thái hoạt động.</CardDescription></CardHeader>
      <CardContent><FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }}/>
        <Field><FieldLabel htmlFor="position-status">Trạng thái</FieldLabel>
          <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}>
            <SelectTrigger id="position-status"><SelectValue/></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value={ALL}>Tất cả</SelectItem><SelectItem value="ACTIVE">Đang hoạt động</SelectItem><SelectItem value="INACTIVE">Ngừng hoạt động</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
      </FieldGroup></CardContent>
    </Card>
    {loading ? <LoadingState/> : error ? <ErrorState error={error}/> : items.length === 0 ? <EmptyState/> : <>
      <div className="flex flex-col gap-3 md:hidden">{items.map(item => <Card key={item.id}>
        <CardHeader><CardTitle>{item.name}</CardTitle><CardDescription>{item.code}</CardDescription></CardHeader>
        <CardContent><dl><dt>Thứ bậc</dt><dd>{item.level}</dd><dt>Trạng thái</dt><dd><StatusBadge status={item.status}/></dd></dl></CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2"><PermissionGate permission="position.manage"><Button className="min-h-11 w-full" variant="outline" asChild><Link to={`/management/positions/${item.id}/edit`}>Sửa</Link></Button>{statusAction(item)}</PermissionGate></CardFooter>
      </Card>)}</div>
      <Card className="hidden md:flex">
        <CardHeader><CardTitle>Kết quả tra cứu</CardTitle><CardDescription>{total} chức danh · {RANK_EXPLANATION}</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên</TableHead><TableHead><span title={RANK_EXPLANATION} aria-label={`Thứ bậc. ${RANK_EXPLANATION}`}>Thứ bậc ⓘ</span></TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
          <TableBody>{items.map(item => <TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.level}</TableCell><TableCell><StatusBadge status={item.status}/></TableCell><TableCell><PermissionGate permission="position.manage"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" asChild><Link to={`/management/positions/${item.id}/edit`}>Sửa</Link></Button>{statusAction(item)}</div></PermissionGate></TableCell></TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </>}
    <Pagination page={page} total={total} limit={20} onChange={setPage}/>
  </main>;
};
