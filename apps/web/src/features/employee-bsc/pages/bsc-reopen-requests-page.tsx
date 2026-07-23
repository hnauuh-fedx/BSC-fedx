import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, EyeIcon, XIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Spinner } from '../../../components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Textarea } from '../../../components/ui/textarea';
import { PermissionGate } from '../../auth/components/permission-gate';
import { AccessibleDialog, EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../../organization/management-ui';
import { BscStatusBadge } from '../components/bsc-status-badge';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscReopenRequest, BscVersionDetail } from '../types/employee-bsc.types';

type Stage = 'PLAN' | 'EVALUATION';
const LIMIT = 10;
const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—';
const stageLabel = (value: Stage) => value === 'PLAN' ? 'Kế hoạch' : 'Đánh giá kết quả';

export const BscReopenRequestsPage: React.FC = () => {
  const [stage, setStage] = useState<Stage>('PLAN');
  const [items, setItems] = useState<BscReopenRequest[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [actingId, setActingId] = useState('');
  const [selected, setSelected] = useState<BscReopenRequest | null>(null);
  const [approving, setApproving] = useState<BscReopenRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejecting, setRejecting] = useState<BscReopenRequest | null>(null);
  const [reason, setReason] = useState('');
  const [sourceVersion, setSourceVersion] = useState<BscVersionDetail | null>(null);
  const generation = useRef(0);
  const mutationPending = useRef(false);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    setItems([]);
    setTotal(0);
    try {
      const result = await employeeBscApi.pendingReopenRequests({ stage, page, limit: LIMIT });
      if (current !== generation.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (cause) {
      if (current === generation.current) {
        setError(cause instanceof Error ? cause.message : 'Không thể tải yêu cầu mở lại.');
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [stage, page]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load, reload]);

  const openDetail = async (requestId: string) => {
    setDetailLoading(true);
    setError('');
    try {
      setSelected(await employeeBscApi.reopenRequest(requestId));
    } catch (cause) {
      setSelected(null);
      setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết yêu cầu.');
    } finally {
      setDetailLoading(false);
    }
  };

  const approve = async (item: BscReopenRequest) => {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setActingId(item.id);
    setError('');
    try {
      await employeeBscApi.approveReopen(item.id);
      setSelected(null);
      setApproving(null);
      setReload(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể duyệt yêu cầu.');
    } finally {
      mutationPending.current = false;
      setActingId('');
    }
  };

  const openSourceVersion = async (item: BscReopenRequest) => {
    if (!item.source_version_id) return;
    setDetailLoading(true);
    setError('');
    try {
      setSourceVersion(await employeeBscApi.version(item.employee_bsc_id, item.source_version_id));
    } catch (cause) {
      setSourceVersion(null);
      setError(cause instanceof Error ? cause.message : 'Không thể tải phiên bản nguồn.');
    } finally {
      setDetailLoading(false);
    }
  };

  const reject = async () => {
    if (!rejecting || !reason.trim() || mutationPending.current) return;
    mutationPending.current = true;
    setActingId(rejecting.id);
    setError('');
    try {
      await employeeBscApi.rejectReopen(rejecting.id, reason);
      setRejecting(null);
      setSelected(null);
      setReason('');
      setReload(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể từ chối yêu cầu.');
    } finally {
      mutationPending.current = false;
      setActingId('');
    }
  };

  const switchStage = (value: string) => {
    setStage(value as Stage);
    setPage(1);
    setSelected(null);
    setRejecting(null);
    setError('');
  };

  return <PermissionGate permission={BSC_PERMISSIONS.REVIEW_REOPEN}>
    <main>
      <PageHeader
        title="Yêu cầu mở lại BSC"
        description="Xem phiên bản đã duyệt và hệ quả trước khi cho phép chỉnh sửa lại."
        action={<Button variant="outline" asChild><Link to="/employee-bsc">Danh sách BSC</Link></Button>}
      />
      <Tabs value={stage} onValueChange={switchStage}>
        <TabsList aria-label="Loại yêu cầu mở lại">
          <TabsTrigger value="PLAN">Yêu cầu sửa kế hoạch</TabsTrigger>
          <TabsTrigger value="EVALUATION">Yêu cầu sửa kết quả</TabsTrigger>
        </TabsList>
      </Tabs>
      {error && <ErrorState error={error} onRetry={() => setReload(value => value + 1)}/>}
      {loading ? <LoadingState/> : !error && items.length === 0
        ? <EmptyState message="Không có yêu cầu mở lại đang chờ xử lý."/>
        : !error && <>
        <div className="flex flex-col gap-3 md:hidden">{items.map(item => <Card key={item.id}>
          <CardHeader><CardTitle>{item.employee_bsc.users_employee_bsc_employee_idTousers.full_name}</CardTitle><CardDescription>{item.employee_bsc.departments.name} · {item.employee_bsc.bsc_cycles.name}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>{item.request_reason}</p>
            <dl><dt>Giai đoạn</dt><dd>{stageLabel(item.stage)}</dd><dt>Người duyệt</dt><dd>{item.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</dd><dt>Thời gian</dt><dd>{formatDate(item.requested_at)}</dd><dt>Trạng thái</dt><dd><BscStatusBadge status={item.status}/></dd></dl>
            <div className="flex flex-col gap-2">
              <Button className="min-h-11 w-full" variant="outline" disabled={Boolean(actingId)} onClick={() => void openDetail(item.id)}><EyeIcon data-icon="inline-start"/>Chi tiết</Button>
              <Button className="min-h-11 w-full" variant="outline" disabled={Boolean(actingId)} onClick={() => { setRejecting(item); setReason(''); }}><XIcon data-icon="inline-start"/>Từ chối</Button>
              <Button className="min-h-11 w-full" disabled={Boolean(actingId)} onClick={() => setApproving(item)}><CheckIcon data-icon="inline-start"/>Duyệt mở lại</Button>
            </div>
          </CardContent>
        </Card>)}</div>
        <Card className="hidden md:flex">
          <CardHeader>
            <CardTitle>Yêu cầu đang chờ</CardTitle>
            <CardDescription>{total} yêu cầu cần được xem xét ở giai đoạn này.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nhân viên</TableHead><TableHead>Đơn vị</TableHead><TableHead>Kỳ</TableHead>
                <TableHead>Giai đoạn</TableHead><TableHead>Lý do</TableHead><TableHead>Người duyệt</TableHead><TableHead>Thời gian</TableHead>
                <TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead>
              </TableRow></TableHeader>
              <TableBody>{items.map(item => <TableRow key={item.id}>
                <TableCell>{item.employee_bsc.users_employee_bsc_employee_idTousers.full_name}</TableCell>
                <TableCell>{item.employee_bsc.departments.name}</TableCell>
                <TableCell>{item.employee_bsc.bsc_cycles.name}</TableCell>
                <TableCell>{stageLabel(item.stage)}</TableCell>
                <TableCell className="max-w-64 whitespace-normal">{item.request_reason}</TableCell>
                <TableCell>{item.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</TableCell>
                <TableCell>{formatDate(item.requested_at)}</TableCell>
                <TableCell><BscStatusBadge status={item.status}/></TableCell>
                <TableCell><div className="flex flex-wrap justify-end gap-2">
                  <Button className="min-h-11 md:min-h-0" variant="outline" size="sm" disabled={Boolean(actingId)} onClick={() => void openDetail(item.id)}>
                    <EyeIcon data-icon="inline-start"/>Chi tiết
                  </Button>
                  <Button className="min-h-11 md:min-h-0" variant="outline" size="sm" disabled={Boolean(actingId)} onClick={() => { setRejecting(item); setReason(''); }}>
                    <XIcon data-icon="inline-start"/>Từ chối
                  </Button>
                  <Button className="min-h-11 md:min-h-0" variant="outline" size="sm" disabled={Boolean(actingId)} onClick={() => setApproving(item)}>
                    <CheckIcon data-icon="inline-start"/>{actingId === item.id ? 'Đang xử lý…' : 'Duyệt mở lại'}
                  </Button>
                </div></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card></>}
      <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
      {detailLoading && <LoadingState/>}

      <AccessibleDialog
        open={Boolean(selected) && !sourceVersion}
        title={`Chi tiết yêu cầu ${selected ? stageLabel(selected.stage) : ''}`}
        description="Kiểm tra lý do, BSC hiện tại và phiên bản nguồn trước khi quyết định."
        onClose={() => setSelected(null)}
        busy={Boolean(actingId)}
      >
        {selected && <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>Ảnh hưởng khi mở lại</AlertTitle>
            <AlertDescription>{selected.stage === 'PLAN'
              ? 'Dữ liệu đánh giá hiện tại sẽ được đặt lại.'
              : 'Chỉ các trường kết quả và thuyết minh được mở lại.'}</AlertDescription>
          </Alert>
          <dl>
            <dt>Lý do</dt><dd>{selected.request_reason}</dd>
            <dt>Người duyệt</dt><dd>{selected.users_bsc_unlock_requests_reviewer_idTousers?.full_name ?? '—'}</dd>
            <dt>Phiên bản nguồn</dt><dd>{selected.source_version_id ?? '—'}</dd>
          </dl>
          <div className="dialog-actions">
            <Button variant="outline" asChild><Link to={`/employee-bsc/${selected.employee_bsc_id}`}>Xem BSC hiện tại</Link></Button>
            {selected.source_version_id && <Button variant="outline" onClick={() => void openSourceVersion(selected)}>Xem phiên bản nguồn</Button>}
            <Button variant="outline" disabled={Boolean(actingId)} onClick={() => { setRejecting(selected); setSelected(null); setReason(''); }}>Từ chối</Button>
            <Button disabled={Boolean(actingId)} onClick={() => void approve(selected)}>
              {actingId && <Spinner data-icon="inline-start"/>}Duyệt mở lại
            </Button>
          </div>
        </div>}
      </AccessibleDialog>

      <AccessibleDialog
        open={Boolean(approving)}
        title={`Duyệt mở lại ${approving ? stageLabel(approving.stage) : ''}`}
        description={approving?.stage === 'PLAN'
          ? 'Định nghĩa KPI được mở lại và dữ liệu đánh giá hiện tại sẽ được đặt lại.'
          : 'Chỉ trường kết quả và thuyết minh kết quả được mở lại; định nghĩa KPI vẫn khóa.'}
        onClose={() => setApproving(null)}
        busy={Boolean(actingId)}
      >
        <div className="dialog-actions">
          <Button disabled={Boolean(actingId)} onClick={() => approving && void approve(approving)}>
            {actingId && <Spinner data-icon="inline-start"/>}Xác nhận duyệt
          </Button>
          <Button variant="outline" disabled={Boolean(actingId)} onClick={() => setApproving(null)}>Hủy</Button>
        </div>
      </AccessibleDialog>

      <AccessibleDialog
        open={Boolean(sourceVersion)}
        title={`Phiên bản nguồn ${sourceVersion?.versionNumber ?? ''}`}
        description="Bản chụp dữ liệu tại thời điểm được duyệt."
        onClose={() => setSourceVersion(null)}
      >
        <pre>{JSON.stringify(sourceVersion?.snapshot, null, 2)}</pre>
        <div className="dialog-actions"><Button variant="outline" onClick={() => setSourceVersion(null)}>Đóng</Button></div>
      </AccessibleDialog>

      <AccessibleDialog
        open={Boolean(rejecting)}
        title="Từ chối yêu cầu mở lại"
        description="Yêu cầu sẽ bị từ chối và BSC tiếp tục ở trạng thái đã khóa."
        onClose={() => setRejecting(null)}
        busy={Boolean(actingId)}
      >
        <FieldGroup><Field data-invalid={!reason.trim()}>
          <FieldLabel htmlFor="reject-reopen-reason">Lý do từ chối</FieldLabel>
          <Textarea id="reject-reopen-reason" aria-invalid={!reason.trim()} maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/>
          {!reason.trim() && <FieldDescription>Vui lòng nhập lý do cụ thể.</FieldDescription>}
        </Field></FieldGroup>
        <div className="dialog-actions">
          <Button variant="destructive" disabled={!reason.trim() || Boolean(actingId)} onClick={() => void reject()}>
            {actingId && <Spinner data-icon="inline-start"/>}Xác nhận từ chối
          </Button>
          <Button variant="outline" disabled={Boolean(actingId)} onClick={() => setRejecting(null)}>Hủy</Button>
        </div>
      </AccessibleDialog>
    </main>
  </PermissionGate>;
};
