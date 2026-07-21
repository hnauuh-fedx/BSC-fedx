import React from 'react';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '../../../app/store/auth-store';
import { SystemConfirmDialogProvider } from '../../../components/system-confirm-dialog';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscReopenRequest, BscScoringPreview, EmployeeBsc } from '../types/employee-bsc.types';
import { BscDetailPage } from './bsc-detail-page';

const render = (ui: React.ReactElement) => testingRender(ui, { wrapper: SystemConfirmDialogProvider });

vi.mock('../../../app/store/auth-store', () => ({ useAuthContext: vi.fn() }));
vi.mock('../services/employee-bsc.service', () => ({
  employeeBscApi: {
    detail: vi.fn(),
    scoringPreview: vi.fn(),
    versions: vi.fn(),
    reopenRequests: vi.fn(),
    approveReopen: vi.fn(),
    rejectReopen: vi.fn(),
    exportExcel: vi.fn(),
  },
}));
vi.mock('../components/bsc-item-table', () => ({
  BscItemTable: ({ onChange }: { onChange: () => Promise<void> }) => (
    <button type="button" onClick={() => void onChange()}>Lưu KPI mô phỏng</button>
  ),
}));

const bsc: EmployeeBsc = {
  id: 'bsc-1',
  bsc_code: 'BSC-TEST',
  cycle_id: 'cycle-1',
  employee_id: 'employee-1',
  department_id: 'department-1',
  position_id: 'position-1',
  direct_manager_id: 'manager-1',
  status: 'DRAFT',
  employee_comment: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  plan_status: 'DRAFT',
  evaluation_status: 'NOT_STARTED',
  bsc_cycles: { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN', end_date: null },
  users_employee_bsc_employee_idTousers: { id: 'employee-1', employee_code: 'E001', full_name: 'Nhân viên thử nghiệm', email: 'employee@example.com' },
  users_employee_bsc_direct_manager_idTousers: { id: 'manager-1', employee_code: 'M001', full_name: 'Quản lý thử nghiệm' },
  departments: { id: 'department-1', code: 'D001', name: 'Đơn vị thử nghiệm' },
  employee_bsc_items: [],
  goal_groups: [],
  bsc_status_histories: [],
};

const scoring: BscScoringPreview = {
  bscId: 'bsc-1',
  planStatus: 'DRAFT',
  evaluationStatus: 'NOT_STARTED',
  totalWeight: 0,
  scoredWeight: 0,
  totalWeightedScore: 0,
  isComplete: false,
  classification: null,
  items: [],
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

describe('BscDetailPage background refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'employee-1', employeeCode: 'E001', fullName: 'Nhân viên thử nghiệm', email: 'employee@example.com', status: 'ACTIVE', roles: [],
          permissions: [BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.VIEW_VERSION, BSC_PERMISSIONS.REQUEST_REOPEN, BSC_PERMISSIONS.EXPORT],
        },
        accessToken: 'token',
        expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.detail).mockResolvedValue(bsc);
    vi.mocked(employeeBscApi.scoringPreview).mockResolvedValue(scoring);
    vi.mocked(employeeBscApi.versions).mockResolvedValue([]);
    vi.mocked(employeeBscApi.reopenRequests).mockResolvedValue([]);
    vi.mocked(employeeBscApi.exportExcel).mockResolvedValue({ blob: new Blob(['excel']), fileName: 'employee-bsc.xlsx' });
  });

  it('allows the employee owner to export the current BSC as Excel', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:employee-bsc');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(employeeBscApi.exportExcel).toHaveBeenCalledWith('employee-1', 'cycle-1'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:employee-bsc');
    createObjectURL.mockRestore(); revokeObjectURL.mockRestore(); click.mockRestore();
  });

  it('does not show personal export when the viewer is not the BSC owner', async () => {
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'manager-1', employeeCode: 'M001', fullName: 'Quản lý', email: 'manager@example.com', status: 'ACTIVE', roles: [],
          permissions: [BSC_PERMISSIONS.EXPORT],
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Lưu KPI mô phỏng' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Xuất Excel' })).not.toBeInTheDocument();
  });

  it('opens the print dialog only after the printable detail data is loaded', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1?print=1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    print.mockRestore();
  });

  it('hides the detail header, general information and unavailable evidence notice', async () => {
    vi.mocked(employeeBscApi.detail).mockResolvedValue({ ...bsc, plan_status: 'APPROVED', evaluation_status: 'DRAFT' });

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Lưu KPI mô phỏng' })).toBeVisible();
    expect(screen.queryByText('BSC-TEST')).not.toBeInTheDocument();
    expect(screen.queryByText('BSC / Chi tiết')).not.toBeInTheDocument();
    expect(screen.queryByText('Quay lại danh sách')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thông tin chung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Minh chứng KPI' })).not.toBeInTheDocument();
    expect(screen.queryByText(/PLAN đã được duyệt/)).not.toBeInTheDocument();
  });

  it('shows the full-page loading state only while the first detail request is pending', async () => {
    const pendingBsc = deferred<EmployeeBsc>();
    const pendingScoring = deferred<BscScoringPreview>();
    vi.mocked(employeeBscApi.detail).mockReturnValueOnce(pendingBsc.promise);
    vi.mocked(employeeBscApi.scoringPreview).mockReturnValueOnce(pendingScoring.promise);

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải dữ liệu…');
    expect(screen.queryByText('BSC-TEST')).not.toBeInTheDocument();

    pendingBsc.resolve(bsc);
    pendingScoring.resolve(scoring);
    expect(await screen.findByRole('button', { name: 'Lưu KPI mô phỏng' })).toBeVisible();
  });

  it('keeps the detail visible and refreshes only the BSC and scoring after a KPI save', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Lưu KPI mô phỏng' })).toBeVisible();
    const versionCalls = vi.mocked(employeeBscApi.versions).mock.calls.length;
    const reopenCalls = vi.mocked(employeeBscApi.reopenRequests).mock.calls.length;
    const pendingBsc = deferred<EmployeeBsc>();
    const pendingScoring = deferred<BscScoringPreview>();
    vi.mocked(employeeBscApi.detail).mockReturnValueOnce(pendingBsc.promise);
    vi.mocked(employeeBscApi.scoringPreview).mockReturnValueOnce(pendingScoring.promise);

    await user.click(screen.getByRole('button', { name: 'Lưu KPI mô phỏng' }));
    await waitFor(() => expect(employeeBscApi.detail).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('button', { name: 'Lưu KPI mô phỏng' })).toBeVisible();
    expect(employeeBscApi.versions).toHaveBeenCalledTimes(versionCalls);
    expect(employeeBscApi.reopenRequests).toHaveBeenCalledTimes(reopenCalls);

    pendingBsc.resolve(bsc);
    pendingScoring.resolve(scoring);
    await waitFor(() => expect(employeeBscApi.scoringPreview).toHaveBeenCalledTimes(2));
  });

  it('shows PLAN approval and return actions to a DIRECTOR in scope', async () => {
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'director-1', employeeCode: 'D001', fullName: 'Giám đốc', email: 'director@example.com', departmentId: 'system', status: 'ACTIVE',
          roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE] }],
          permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE],
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.detail).mockResolvedValue({ ...bsc, plan_status: 'SUBMITTED' });

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Duyệt BSC' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trả lại BSC' })).toBeVisible();
  });

  it('keeps a canonical MANAGER in view-only mode even when stale review permissions remain', async () => {
    const reviewPermissions = [
      BSC_PERMISSIONS.MANAGE_KPI,
      BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.REVIEW_REOPEN,
    ];
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'manager-1', employeeCode: 'M001', fullName: 'Trưởng phòng', email: 'manager@example.com', departmentId: 'department-1', status: 'ACTIVE',
          roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: 'department-1', permissions: reviewPermissions }],
          permissions: reviewPermissions,
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.detail).mockResolvedValue({ ...bsc, plan_status: 'SUBMITTED' });

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: /KPI/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Duy.*BSC/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tr.*l.*BSC/ })).not.toBeInTheDocument();
  });

  it('shows EVALUATION approval and return actions to a DIRECTOR in scope', async () => {
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'director-1', employeeCode: 'D001', fullName: 'Giám đốc', email: 'director@example.com', departmentId: 'system', status: 'ACTIVE',
          roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: [BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE] }],
          permissions: [BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE],
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.detail).mockResolvedValue({ ...bsc, plan_status: 'APPROVED', evaluation_status: 'SUBMITTED' });

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Duyệt kết quả' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trả lại kết quả' })).toBeVisible();
  });

  it('does not show review actions for a DIRECTOR-owned BSC', async () => {
    const reviewPermissions = [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE];
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'director-1', employeeCode: 'D001', fullName: 'Giám đốc', email: 'director@example.com', departmentId: 'system', status: 'ACTIVE',
          roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: reviewPermissions }], permissions: reviewPermissions,
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.detail).mockResolvedValue({ ...bsc, employee_id: 'director-1', plan_status: 'SUBMITTED' });

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Lưu KPI mô phỏng' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Duyệt BSC' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trả lại BSC' })).not.toBeInTheDocument();
  });

  it('shows reopen approval actions to a DIRECTOR in scope', async () => {
    const user = userEvent.setup();
    const reviewPermissions = [BSC_PERMISSIONS.REVIEW_REOPEN];
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'director-1', employeeCode: 'D001', fullName: 'Giám đốc', email: 'director@example.com', departmentId: 'system', status: 'ACTIVE',
          roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: reviewPermissions }], permissions: reviewPermissions,
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.detail).mockResolvedValue({ ...bsc, plan_status: 'APPROVED', evaluation_status: 'DRAFT' });
    vi.mocked(employeeBscApi.reopenRequests).mockResolvedValue([{
      id: 'reopen-1', employee_bsc_id: bsc.id, stage: 'PLAN', requested_by: bsc.employee_id, reviewer_id: 'director-1',
      request_reason: 'Cần sửa kế hoạch', requested_at: '2026-07-20T09:12:00.000Z', status: 'PENDING',
      reviewed_by: null, review_comment: null, reviewed_at: null, source_version_id: 'version-1', resulting_version_id: null,
      users_bsc_unlock_requests_requested_byTousers: bsc.users_employee_bsc_employee_idTousers,
      users_bsc_unlock_requests_reviewer_idTousers: { id: 'director-1', employee_code: 'D001', full_name: 'Giám đốc' },
      employee_bsc: { ...bsc, plan_status: 'APPROVED', evaluation_status: 'DRAFT' },
    } satisfies BscReopenRequest]);

    render(
      <MemoryRouter initialEntries={['/employee-bsc/bsc-1']}>
        <Routes><Route path="/employee-bsc/:id" element={<BscDetailPage/>}/></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Duyệt mở lại' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Từ chối mở lại' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Duyệt mở lại' }));
    expect(screen.getByRole('alertdialog', { name: 'Duyệt mở lại kế hoạch?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Duyệt mở lại' }));
    await waitFor(() => expect(employeeBscApi.approveReopen).toHaveBeenCalledWith('reopen-1'));
  });
});
