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

  return <main>
    <PageHeader title="Chức danh" />
    <PermissionGate permission="position.manage">
      <section>
        <PositionForm submitLabel="Tạo chức danh" resetOnSuccess onSubmit={async payload => {
          await organizationApi.createPosition(payload);
          setSuccess('Đã tạo chức danh.');
          load();
        }} />
      </section>
    </PermissionGate>
    {success && <p role="status">{success}</p>}
    <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} />
    <select aria-label="Trạng thái" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option>
    </select>
    {loading ? <LoadingState /> : error ? <ErrorState error={error} /> : items.length === 0 ? <EmptyState /> : <table>
      <thead><tr><th>Mã</th><th>Tên</th><th><span title={RANK_EXPLANATION} aria-label={`Thứ bậc. ${RANK_EXPLANATION}`}>Thứ bậc <span aria-hidden="true">ⓘ</span></span></th><th>Trạng thái</th><th /></tr></thead>
      <tbody>{items.map(item => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{item.level}</td><td><StatusBadge status={item.status} /></td><td><PermissionGate permission="position.manage"><Link to={`/management/positions/${item.id}/edit`}>Sửa</Link> <ConfirmButton message="Xác nhận thay đổi trạng thái?" onConfirm={() => void organizationApi.positionStatus(item.id, item.status !== 'ACTIVE').then(load).catch(e => setError(e.message))}>{item.status === 'ACTIVE' ? 'Ngừng' : 'Kích hoạt'}</ConfirmButton></PermissionGate></td></tr>)}</tbody>
    </table>}
    <Pagination page={page} total={total} limit={20} onChange={setPage} />
  </main>;
};
