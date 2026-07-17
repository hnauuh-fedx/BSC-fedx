import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../auth/components/permission-gate';
import { PositionForm } from '../components/position-form';
import { organizationApi, Position } from '../organization-api';
import { ConfirmButton, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, StatusBadge } from '../management-ui';

const RANK_EXPLANATION = 'Chỉ dùng để sắp xếp chức danh, không đại diện cho quyền hệ thống.';

export const PositionsPage: React.FC = () => {
  const [items, setItems] = useState<Position[]>([]), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const load = useCallback(() => { setLoading(true); setError(''); organizationApi.positions({ search, status, page, limit: 20 }).then(result => { setItems(result.items); setTotal(result.total); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [search, status, page]);
  useEffect(() => { load(); }, [load]);

  return <main className="flex flex-col gap-6">
    <PageHeader title="Quản lý chức danh" description="Thiết lập danh mục chức danh và thứ bậc dùng để sắp xếp trong cơ cấu tổ chức." />
    <PermissionGate permission="position.manage">
      <section aria-labelledby="create-position-title" className="rounded-xl border bg-card p-5">
        <div className="mb-4">
          <h2 id="create-position-title" className="text-lg font-semibold">Thêm chức danh</h2>
          <p className="text-sm text-muted-foreground">Nhập thông tin cơ bản và chọn thứ bậc phù hợp với vị trí trong tổ chức.</p>
        </div>
        <PositionForm submitLabel="Tạo chức danh" resetOnSuccess onSubmit={async payload => {
          await organizationApi.createPosition(payload);
          setSuccess('Đã tạo chức danh.');
          load();
        }} />
      </section>
    </PermissionGate>
    {success && <p role="status">{success}</p>}
    <section aria-labelledby="position-list-title" className="flex flex-col gap-4">
      <div>
        <h2 id="position-list-title" className="text-lg font-semibold">Danh sách chức danh</h2>
        <p className="text-sm text-muted-foreground">Tra cứu, chỉnh sửa và quản lý trạng thái các chức danh hiện có.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} />
        <select aria-label="Trạng thái" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option>
        </select>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState error={error} /> : items.length === 0 ? <EmptyState /> : <table>
        <thead><tr><th>Mã</th><th>Tên</th><th><span title={RANK_EXPLANATION} aria-label={`Thứ bậc. ${RANK_EXPLANATION}`}>Thứ bậc <span aria-hidden="true">ⓘ</span></span></th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{item.level}</td><td><StatusBadge status={item.status} /></td><td><PermissionGate permission="position.manage"><Link to={`/management/positions/${item.id}/edit`}>Sửa</Link> <ConfirmButton message="Xác nhận thay đổi trạng thái?" onConfirm={() => void organizationApi.positionStatus(item.id, item.status !== 'ACTIVE').then(load).catch(e => setError(e.message))}>{item.status === 'ACTIVE' ? 'Ngừng' : 'Kích hoạt'}</ConfirmButton></PermissionGate></td></tr>)}</tbody>
      </table>}
      <Pagination page={page} total={total} limit={20} onChange={setPage} />
    </section>
  </main>;
};
