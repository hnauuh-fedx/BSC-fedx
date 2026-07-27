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
    expect(screen.getByText('Điểm trung bình')).toBeVisible();
    expect(screen.getByText('94')).toBeVisible();
    expect(screen.queryByLabelText('Phòng ban')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nhân viên')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phạm vi báo cáo')).not.toBeInTheDocument();
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

    const scope = await screen.findByLabelText('Phạm vi báo cáo');
    expect(scope).toHaveTextContent('Đơn vị phụ trách');
    await userEvent.click(screen.getByRole('tab', { name: 'Danh sách BSC' }));
    expect(screen.getByLabelText('Phòng ban')).toBeVisible();
    expect(screen.getByLabelText('Nhân viên')).toBeVisible();

    await user.click(scope);
    await user.click(await screen.findByRole('option', { name: 'Cá nhân' }));

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

    const scope = await screen.findByLabelText('Phạm vi báo cáo');
    expect(screen.queryByRole('button', { name: 'Xuất Excel' })).not.toBeInTheDocument();
    await user.click(scope);
    await user.click(await screen.findByRole('option', { name: 'Cá nhân' }));
    expect(await screen.findByRole('button', { name: 'Xuất Excel' })).toBeVisible();
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
