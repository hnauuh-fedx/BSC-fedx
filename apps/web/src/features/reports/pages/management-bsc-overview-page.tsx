import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { PermissionGate } from '../../auth/components/permission-gate';
import { BscStatusBadge } from '../../employee-bsc/components/bsc-status-badge';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, TableContainer } from '../../organization/management-ui';
import { reportsApi } from '../reports-api';
import { ManagementDashboard, ReportPage } from '../reports.types';

const MANAGEMENT_PERMISSIONS = ['bsc.statistics.unit', 'bsc.statistics.organization'];
const LIMIT = 20;
const metric = (label: string, value: number) => (
  <Card>
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle>{value}</CardTitle>
    </CardHeader>
  </Card>
);

export const ManagementBscOverviewPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<ManagementDashboard | null>(null);
  const [page, setPage] = useState<ReportPage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDashboard, nextPage] = await Promise.all([
        reportsApi.dashboard(),
        reportsApi.list({ page: currentPage, limit: LIMIT, sortBy: 'created_at', sortOrder: 'desc' }),
      ]);
      if (nextDashboard.kind !== 'MANAGEMENT') throw new Error('Tài khoản không có tổng quan đơn vị.');
      setDashboard(nextDashboard);
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải tổng quan BSC.');
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => { void load(); }, [load, reload]);

  return <PermissionGate anyOf={MANAGEMENT_PERMISSIONS} fallback={<main><ErrorState error="Bạn không có quyền xem tổng quan BSC theo đơn vị."/></main>}>
    <main className="flex flex-col gap-5">
      <PageHeader title="Tổng quan BSC đơn vị" description="Dữ liệu nhân sự và BSC được backend giới hạn theo quyền và phạm vi của tài khoản." action={<Link to="/management/bsc-reviews">Mở BSC chờ duyệt</Link>}/>
      {loading ? <LoadingState/> : error ? <ErrorState error={error} onRetry={() => setReload((value) => value + 1)}/> : dashboard && page ? <>
        <p>Kỳ hiện tại: <strong>{dashboard.currentCycle?.name ?? 'Chưa có kỳ đang mở'}</strong></p>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metric('Chưa tạo BSC', dashboard.notCreated)}
          {metric('Chờ duyệt PLAN', dashboard.pendingPlanReviews)}
          {metric('PLAN bị trả lại', dashboard.planStatusCounts.RETURNED ?? 0)}
          {metric('PLAN đã duyệt', dashboard.planStatusCounts.APPROVED ?? 0)}
          {metric('Chờ duyệt EVALUATION', dashboard.pendingEvaluationReviews)}
          {metric('EVALUATION bị trả lại', dashboard.evaluationStatusCounts.RETURNED ?? 0)}
          {metric('EVALUATION đã duyệt', dashboard.evaluationStatusCounts.APPROVED ?? 0)}
        </section>
        {page.items.length === 0 ? <EmptyState message="Chưa có BSC trong phạm vi được phép xem."/> : <TableContainer label="BSC trong phạm vi quản lý"><table><thead><tr><th scope="col">Nhân viên</th><th scope="col">Mã nhân viên</th><th scope="col">Đơn vị</th><th scope="col">Kỳ</th><th scope="col">PLAN</th><th scope="col">EVALUATION</th><th scope="col">Thao tác</th></tr></thead><tbody>{page.items.map((item) => <tr key={item.id}><td>{item.employeeName}</td><td>{item.employeeCode}</td><td>{item.departmentName}</td><td>{item.cycleName}</td><td><BscStatusBadge status={item.planStatus}/></td><td><BscStatusBadge status={item.evaluationStatus}/></td><td><Link to={`/employee-bsc/${item.id}`}>Xem chi tiết</Link></td></tr>)}</tbody></table></TableContainer>}
        <Pagination page={currentPage} total={page.total} limit={LIMIT} onChange={setCurrentPage}/>
      </> : <EmptyState/>}
    </main>
  </PermissionGate>;
};
