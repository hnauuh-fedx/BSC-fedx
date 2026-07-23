import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { PermissionGate } from '../../auth/components/permission-gate';
import { BscStatusBadge } from '../../employee-bsc/components/bsc-status-badge';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../../organization/management-ui';
import { reportsApi } from '../reports-api';
import { ManagementDashboard, ReportPage } from '../reports.types';

const MANAGEMENT_PERMISSIONS = ['bsc.statistics.unit', 'bsc.statistics.organization'];
const LIMIT = 20;

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => <Card size="sm">
  <CardHeader><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader>
</Card>;

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
      <PageHeader
        title="Tổng quan BSC đơn vị"
        description="Dữ liệu nhân sự và BSC được backend giới hạn theo quyền và phạm vi của tài khoản."
        action={<Button className="min-h-11 w-full md:min-h-0 md:w-auto" asChild><Link to="/management/bsc-reviews">Mở BSC chờ duyệt<ArrowRightIcon data-icon="inline-end"/></Link></Button>}
      />
      {loading ? <LoadingState/> : error ? <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/> : dashboard && page ? <>
        <Card>
          <CardHeader>
            <CardTitle>Kỳ BSC hiện tại</CardTitle>
            <CardDescription>Phạm vi thống kê đang áp dụng cho trang tổng quan.</CardDescription>
          </CardHeader>
          <CardContent><Badge variant="secondary">{dashboard.currentCycle?.name ?? 'Chưa có kỳ đang mở'}</Badge></CardContent>
        </Card>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số tổng quan">
          <Metric label="Chưa tạo BSC" value={dashboard.notCreated}/>
          <Metric label="Chờ duyệt kế hoạch" value={dashboard.pendingPlanReviews}/>
          <Metric label="Kế hoạch bị trả lại" value={dashboard.planStatusCounts.RETURNED ?? 0}/>
          <Metric label="Kế hoạch đã duyệt" value={dashboard.planStatusCounts.APPROVED ?? 0}/>
          <Metric label="Chờ duyệt đánh giá" value={dashboard.pendingEvaluationReviews}/>
          <Metric label="Đánh giá bị trả lại" value={dashboard.evaluationStatusCounts.RETURNED ?? 0}/>
          <Metric label="Đánh giá đã duyệt" value={dashboard.evaluationStatusCounts.APPROVED ?? 0}/>
        </section>
        {page.items.length === 0 ? <EmptyState message="Chưa có BSC trong phạm vi được phép xem."/> : <>
          <div className="flex flex-col gap-3 md:hidden">{page.items.map(item => <Card key={item.id}>
            <CardHeader><CardTitle>{item.employeeName}</CardTitle><CardDescription>{item.employeeCode} · {item.departmentName}</CardDescription></CardHeader>
            <CardContent><dl><dt>Kỳ</dt><dd>{item.cycleName}</dd><dt>Kế hoạch</dt><dd><BscStatusBadge status={item.planStatus}/></dd><dt>Đánh giá</dt><dd><BscStatusBadge status={item.evaluationStatus}/></dd></dl></CardContent>
            <CardFooter><Button className="min-h-11 w-full" variant="outline" asChild><Link to={`/employee-bsc/${item.id}`}>Xem chi tiết</Link></Button></CardFooter>
          </Card>)}</div>
          <Card className="hidden md:flex">
            <CardHeader><CardTitle>BSC trong phạm vi quản lý</CardTitle><CardDescription>{page.total} BSC có thể truy cập.</CardDescription></CardHeader>
            <CardContent><Table>
              <TableHeader><TableRow><TableHead>Nhân viên</TableHead><TableHead>Mã nhân viên</TableHead><TableHead>Đơn vị</TableHead><TableHead>Kỳ</TableHead><TableHead>Kế hoạch</TableHead><TableHead>Đánh giá</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
              <TableBody>{page.items.map(item => <TableRow key={item.id}>
                <TableCell>{item.employeeName}</TableCell><TableCell>{item.employeeCode}</TableCell><TableCell>{item.departmentName}</TableCell><TableCell>{item.cycleName}</TableCell>
                <TableCell><BscStatusBadge status={item.planStatus}/></TableCell><TableCell><BscStatusBadge status={item.evaluationStatus}/></TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" asChild><Link to={`/employee-bsc/${item.id}`}>Xem chi tiết</Link></Button></TableCell>
              </TableRow>)}</TableBody>
            </Table></CardContent>
          </Card>
        </>}
        <Pagination page={currentPage} total={page.total} limit={LIMIT} onChange={setCurrentPage}/>
      </> : <EmptyState/>}
    </main>
  </PermissionGate>;
};
