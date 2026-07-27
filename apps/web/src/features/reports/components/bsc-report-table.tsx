import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatReportScore } from '../report-format';
import { ReportRow } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const reportDateFormatter = new Intl.DateTimeFormat('vi-VN');

const formatReportDate = (value: string | null) => value
  ? reportDateFormatter.format(new Date(value))
  : '—';

const ReportStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge variant={status === 'SUBMITTED' ? 'default' : status === 'APPROVED' ? 'outline' : 'secondary'}>
    {workflowStatusLabel(status)}
  </Badge>
);

export const BscReportTable: React.FC<{
  items: ReportRow[];
  isManagement: boolean;
}> = ({ items, isManagement }) => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Báo cáo BSC chi tiết</CardTitle>
        <CardDescription>Chọn tên nhân sự để mở hồ sơ BSC tương ứng.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table className={isManagement ? 'min-w-[1120px]' : 'min-w-[820px]'}>
          <TableHeader className="[&_th]:font-mono [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
            <TableRow>
              {isManagement && (
                <>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Phòng ban</TableHead>
                  <TableHead>Chức danh</TableHead>
                </>
              )}
              <TableHead>Kỳ BSC</TableHead>
              <TableHead>Kế hoạch</TableHead>
              <TableHead>Đánh giá</TableHead>
              <TableHead className="text-right">Tỷ trọng / KPI</TableHead>
              <TableHead className="text-right">Điểm</TableHead>
              <TableHead className="text-center">Xếp loại</TableHead>
              <TableHead>Duyệt kế hoạch</TableHead>
              <TableHead>Duyệt đánh giá</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(row => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/employee-bsc/${row.id}`)}
              >
                {isManagement && (
                  <>
                    <TableCell>
                      <Link
                        className="font-medium"
                        to={`/employee-bsc/${row.id}`}
                        onClick={event => event.stopPropagation()}
                        aria-label={`Xem BSC của ${row.employeeName} kỳ ${row.cycleName}`}
                      >
                        {row.employeeName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.departmentName}</TableCell>
                    <TableCell>{row.positionName}</TableCell>
                  </>
                )}
                {!isManagement && (
                  <TableCell>
                    <Link
                      className="font-medium"
                      to={`/employee-bsc/${row.id}`}
                      onClick={event => event.stopPropagation()}
                      aria-label={`Xem BSC của ${row.employeeName} kỳ ${row.cycleName}`}
                    >
                      {row.cycleName}
                    </Link>
                  </TableCell>
                )}
                {isManagement && <TableCell>{row.cycleName}</TableCell>}
                <TableCell><ReportStatusBadge status={row.planStatus}/></TableCell>
                <TableCell><ReportStatusBadge status={row.evaluationStatus}/></TableCell>
                <TableCell className="text-right">{row.totalWeight}% / {row.kpiCount}</TableCell>
                <TableCell className="text-right">
                  <span className="font-medium">{formatReportScore(row.officialScore)}</span>
                </TableCell>
                <TableCell className="text-center">
                  {row.officialGrade ? <Badge variant="outline">{row.officialGrade}</Badge> : '—'}
                </TableCell>
                <TableCell>{formatReportDate(row.planApprovedAt)}</TableCell>
                <TableCell>{formatReportDate(row.evaluationApprovedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
