import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/hooks/use-auth';
import { reportsApi } from '../reports-api';
import { ReportOptions } from '../reports.types';
import { BscReportPage } from './bsc-report-page';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../reports-api', () => ({
  reportsApi: {
    options: vi.fn(),
    summary: vi.fn(),
    list: vi.fn(),
    export: vi.fn(),
  },
}));

const row = {
  id: 'bsc-1',
  bscCode: 'BSC-HIDDEN',
  employeeId: 'employee-1',
  employeeCode: 'NV001',
  employeeName: 'Nguyễn Văn A',
  departmentId: 'department-1',
  departmentName: 'Marketing',
  positionName: 'Nhân viên',
  directManagerName: 'Trưởng phòng',
  cycleId: 'cycle-1',
  cycleCode: 'T7',
  cycleName: 'Tháng 7',
  planStatus: 'APPROVED',
  evaluationStatus: 'APPROVED',
  totalWeight: '100',
  kpiCount: 5,
  officialScore: '94',
  officialGrade: 'A',
  planApprovedAt: null,
  evaluationApprovedAt: null,
};

const summary = {
  totalBsc: 1,
  planStatusCounts: { DRAFT: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 1, REOPENED: 0 },
  evaluationStatusCounts: { NOT_STARTED: 0, DRAFT: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 1, REOPENED: 0 },
  pendingPlanReviews: 0,
  pendingEvaluationReviews: 0,
  pendingReopenRequests: 0,
  gradeDistribution: { C: 0, B: 0, A: 1, 'A+': 0, 'A++': 0 },
  approvedAverageScore: '94',
  departmentProgress: [
    { departmentId: 'department-1', departmentName: 'Marketing', totalBsc: 1, approvedBsc: 1, completionPercentage: 100 },
  ],
  scoreTrend: [
    { cycleId: 'cycle-1', cycleName: 'Tháng 7', year: 2026, month: 7, approvedAverageScore: '94', approvedCount: 1 },
  ],
};

const personalOptions: ReportOptions = {
  capabilities: {
    canViewPersonal: true,
    canViewManagement: false,
    canExportPersonal: true,
    canExportManagement: false,
    defaultScope: 'PERSONAL',
  },
  cycles: [{ id: 'cycle-1', code: 'T7', name: 'Tháng 7', year: 2026, month: 7, status: 'OPEN' }],
  departments: [{ id: 'department-1', name: 'Marketing' }],
  employees: [{ id: 'employee-1', employee_code: 'NV001', full_name: 'Nguyễn Văn A', department_id: 'department-1' }],
};

describe('BscReportPage desktop report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'employee-1',
        employeeCode: 'NV001',
        fullName: 'Nguyễn Văn A',
        email: 'employee@example.test',
        departmentId: 'department-1',
        status: 'ACTIVE',
        roles: [],
        permissions: ['bsc.statistics.personal', 'bsc.report.export'],
      },
      isAuthenticated: true,
      isLoading: false,
      status: 'authenticated',
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(reportsApi.options).mockResolvedValue(personalOptions);
    vi.mocked(reportsApi.summary).mockResolvedValue(summary);
    vi.mocked(reportsApi.list).mockResolvedValue({ items: [row], page: 1, limit: 20, total: 1 });
  });

  const DetailProbe = () => <p>Chi tiết BSC đã mở: {useParams().id}</p>;
  const renderPage = () => render(
    <MemoryRouter initialEntries={['/reports/bsc']}>
      <Routes>
        <Route path="/reports/bsc" element={<BscReportPage/>}/>
        <Route path="/employee-bsc/:id" element={<DetailProbe/>}/>
      </Routes>
    </MemoryRouter>,
  );

  it('renders a personal overview without management-only filters', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Báo cáo BSC cá nhân' })).toBeVisible();
    expect(await screen.findByText('Điểm trung bình')).toBeVisible();
    expect(screen.getByText('94,00')).toBeVisible();
    expect(await screen.findByRole(
      'heading',
      { name: 'Xu hướng điểm BSC' },
      { timeout: 5_000 },
    )).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Phân bố xếp loại' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tiến độ phê duyệt theo phòng ban' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phòng ban')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nhân viên')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Phạm vi báo cáo' })).not.toBeInTheDocument();
    expect(reportsApi.summary).toHaveBeenCalledWith(expect.objectContaining({ viewScope: 'PERSONAL' }));
    expect(reportsApi.list).toHaveBeenCalledWith(expect.objectContaining({ viewScope: 'PERSONAL' }));
    expect(vi.mocked(reportsApi.summary).mock.calls[0][0]).not.toHaveProperty('sortBy');
    expect(reportsApi.list).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'created_at', sortOrder: 'desc' }));
  });

  it('lets a multi-scope user switch to the personal report', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.options).mockResolvedValue({
      ...personalOptions,
      capabilities: {
        canViewPersonal: true,
        canViewManagement: true,
        canExportPersonal: true,
        canExportManagement: true,
        defaultScope: 'MANAGEMENT',
      },
    });

    renderPage();

    await screen.findByRole('radiogroup', { name: 'Phạm vi báo cáo' });
    expect(screen.getByRole('radio', { name: 'Đơn vị phụ trách' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Danh sách BSC' }));
    expect(screen.getByLabelText('Phòng ban')).toBeVisible();
    expect(screen.getByLabelText('Nhân viên')).toBeVisible();

    await user.click(screen.getByRole('radio', { name: 'Cá nhân' }));

    await waitFor(() => expect(reportsApi.summary).toHaveBeenLastCalledWith(expect.objectContaining({ viewScope: 'PERSONAL' })));
    expect(reportsApi.options).toHaveBeenLastCalledWith({ viewScope: 'PERSONAL' });
    expect(screen.queryByLabelText('Phòng ban')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nhân viên')).not.toBeInTheDocument();
  });

  it('shows export only for the selected scope capability', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.options).mockResolvedValue({
      ...personalOptions,
      capabilities: {
        canViewPersonal: true,
        canViewManagement: true,
        canExportPersonal: true,
        canExportManagement: false,
        defaultScope: 'MANAGEMENT',
      },
    });

    renderPage();

    await screen.findByRole('radiogroup', { name: 'Phạm vi báo cáo' });
    expect(screen.queryByRole('button', { name: 'Xuất Excel' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Cá nhân' }));
    expect(await screen.findByRole('button', { name: 'Xuất Excel' })).toBeVisible();
  });

  it('uses a searchable employee combobox and collapsible advanced filters for management', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.options).mockResolvedValue({
      ...personalOptions,
      capabilities: {
        canViewPersonal: true,
        canViewManagement: true,
        canExportPersonal: true,
        canExportManagement: true,
        defaultScope: 'MANAGEMENT',
      },
    });

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Danh sách BSC' }));
    const employee = screen.getByRole('combobox', { name: 'Nhân viên' });
    await user.click(employee);
    await user.clear(employee);
    await user.type(employee, 'NV001');
    await user.click(await screen.findByRole('option', { name: /NV001/ }));
    await waitFor(() => expect(reportsApi.summary).toHaveBeenLastCalledWith(expect.objectContaining({ employeeId: 'employee-1' })));

    expect(screen.queryByLabelText('Trạng thái kế hoạch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bộ lọc nâng cao' }));
    expect(screen.getByLabelText('Trạng thái kế hoạch')).toBeVisible();
  });

  it('retries scope-specific filter options after a request failure', async () => {
    const user = userEvent.setup();
    const managementOptions: ReportOptions = {
      ...personalOptions,
      capabilities: {
        canViewPersonal: true,
        canViewManagement: true,
        canExportPersonal: true,
        canExportManagement: true,
        defaultScope: 'MANAGEMENT',
      },
    };
    vi.mocked(reportsApi.options)
      .mockResolvedValueOnce(managementOptions)
      .mockRejectedValueOnce(new Error('Không thể tải bộ lọc phạm vi.'))
      .mockResolvedValue(managementOptions);

    renderPage();

    expect(await screen.findByText('Không thể tải bộ lọc phạm vi.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(reportsApi.options).toHaveBeenCalledTimes(3));
    expect(reportsApi.options).toHaveBeenLastCalledWith({ viewScope: 'MANAGEMENT' });
  });

  it('shows the desktop table and opens detail from its accessible link', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Danh sách BSC' }));
    const detailLink = await screen.findByRole('link', { name: 'Xem BSC của Nguyễn Văn A kỳ Tháng 7' });
    const reportRow = detailLink.closest('tr');
    expect(screen.queryByRole('columnheader', { name: 'Mã nhân viên' })).not.toBeInTheDocument();
    expect(screen.queryByText('NV001')).not.toBeInTheDocument();
    expect(screen.queryByText('BSC-HIDDEN')).not.toBeInTheDocument();
    expect(reportRow).not.toBeNull();

    await user.click(detailLink);
    expect(await screen.findByText('Chi tiết BSC đã mở: bsc-1')).toBeVisible();
  });
});
