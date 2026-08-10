import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from '../reports-api';
import { REPORT_GRADE_OPTIONS } from '../report-test-fixtures';
import type { ManagementDashboard, ReportOptions } from '../reports.types';
import { ManagementBscOverviewPage } from './management-bsc-overview-page';

vi.mock('../../auth/components/permission-gate', () => ({
  PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../reports-api', () => ({
  reportsApi: {
    dashboard: vi.fn(),
    list: vi.fn(),
    options: vi.fn(),
  },
}));

const options: ReportOptions = {
  capabilities: {
    canViewPersonal: false,
    canViewManagement: true,
    canExportPersonal: false,
    canExportManagement: false,
    defaultScope: 'MANAGEMENT',
  },
  grades: REPORT_GRADE_OPTIONS,
  cycles: [
    { id: '00000000-0000-4000-8000-000000000001', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' },
    { id: '00000000-0000-4000-8000-000000000002', code: 'T6', name: 'Tháng 6/2026', year: 2026, month: 6, status: 'CLOSED' },
  ],
  departments: [
    { id: '00000000-0000-4000-8000-000000000011', name: 'Marketing' },
    { id: '00000000-0000-4000-8000-000000000012', name: 'Kinh doanh' },
  ],
  employees: [
    { id: '00000000-0000-4000-8000-000000000021', employee_code: 'NV001', full_name: 'Nguyễn Văn A', department_id: '00000000-0000-4000-8000-000000000011' },
  ],
};

const dashboard: ManagementDashboard = {
  kind: 'MANAGEMENT',
  currentCycle: options.cycles[0],
  notCreated: 1,
  grades: REPORT_GRADE_OPTIONS,
  totalBsc: 0,
  planStatusCounts: { DRAFT: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0, REOPENED: 0 },
  evaluationStatusCounts: { NOT_STARTED: 0, DRAFT: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0, REOPENED: 0 },
  pendingPlanReviews: 0,
  pendingEvaluationReviews: 0,
  pendingReopenRequests: 0,
  gradeDistribution: { D: 0, C: 0, B: 0, A: 0, 'A+': 0 },
  approvedAverageScore: null,
  departmentProgress: [],
  scoreTrend: [],
};

const latestListParams = () => {
  const calls = vi.mocked(reportsApi.list).mock.calls;
  return calls[calls.length - 1]?.[0];
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
};

const BackButton = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Quay lại</button>;
};

describe('ManagementBscOverviewPage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.options).mockResolvedValue(options);
    vi.mocked(reportsApi.dashboard).mockResolvedValue(dashboard);
    vi.mocked(reportsApi.list).mockResolvedValue({ items: [], page: 2, limit: 20, total: 21 });
  });

  it('restores URL filters and applies the same scope to dashboard and list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[
        '/management/bsc-overview?cycleId=00000000-0000-4000-8000-000000000002&departmentId=00000000-0000-4000-8000-000000000011&planStatus=APPROVED&page=2',
      ]}>
        <ManagementBscOverviewPage/>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('Kỳ BSC')).toBeVisible();
    expect(screen.getByLabelText('Phòng ban')).toBeVisible();

    await waitFor(() => expect(reportsApi.dashboard).toHaveBeenCalledWith(expect.objectContaining({
      viewScope: 'MANAGEMENT',
      cycleId: '00000000-0000-4000-8000-000000000002',
      departmentId: '00000000-0000-4000-8000-000000000011',
      planStatus: 'APPROVED',
    })));
    expect(reportsApi.list).toHaveBeenCalledWith(expect.objectContaining({
      viewScope: 'MANAGEMENT',
      cycleId: '00000000-0000-4000-8000-000000000002',
      departmentId: '00000000-0000-4000-8000-000000000011',
      planStatus: 'APPROVED',
      page: 2,
      limit: 20,
    }));

    await user.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
    await waitFor(() => {
      const latest = latestListParams();
      expect(latest).toEqual(expect.objectContaining({
        viewScope: 'MANAGEMENT',
        cycleId: '00000000-0000-4000-8000-000000000001',
        page: 1,
      }));
      expect(latest?.departmentId).toBeUndefined();
      expect(latest?.planStatus).toBeUndefined();
    });
  });

  it('clears an invalid employee, resets pagination and debounces employee search', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[
        '/management/bsc-overview?departmentId=00000000-0000-4000-8000-000000000011&employeeId=00000000-0000-4000-8000-000000000021&page=2',
      ]}>
        <ManagementBscOverviewPage/>
      </MemoryRouter>,
    );

    await user.click(await screen.findByLabelText('Phòng ban'));
    await user.click(await screen.findByRole('option', { name: 'Kinh doanh' }));

    await waitFor(() => {
      const latest = latestListParams();
      expect(latest).toEqual(expect.objectContaining({
        departmentId: '00000000-0000-4000-8000-000000000012',
        page: 1,
      }));
      expect(latest?.employeeId).toBeUndefined();
    });

    await user.type(screen.getByLabelText('Tìm nhân viên'), 'NV002');
    await waitFor(() => expect(reportsApi.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({
      departmentId: '00000000-0000-4000-8000-000000000012',
      search: 'NV002',
    })));
  });

  it('restores filter state when browser history navigates to an earlier query', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          '/management/bsc-overview?cycleId=00000000-0000-4000-8000-000000000001&departmentId=00000000-0000-4000-8000-000000000011',
          '/management/bsc-overview?cycleId=00000000-0000-4000-8000-000000000001&departmentId=00000000-0000-4000-8000-000000000012',
        ]}
        initialIndex={1}
      >
        <ManagementBscOverviewPage/>
        <BackButton/>
      </MemoryRouter>,
    );

    await waitFor(() => expect(reportsApi.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({
      departmentId: '00000000-0000-4000-8000-000000000012',
    })));
    await user.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => expect(reportsApi.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({
      departmentId: '00000000-0000-4000-8000-000000000011',
    })));
  });

  it('keeps the newest result when an older filtered request finishes later', async () => {
    const user = userEvent.setup();
    const olderRequest = deferred<ManagementDashboard>();
    vi.mocked(reportsApi.dashboard).mockImplementation(params => {
      if (params?.departmentId === '00000000-0000-4000-8000-000000000011') return olderRequest.promise;
      if (params?.departmentId === '00000000-0000-4000-8000-000000000012') {
        return Promise.resolve({ ...dashboard, notCreated: 12 });
      }
      return Promise.resolve(dashboard);
    });

    render(
      <MemoryRouter>
        <ManagementBscOverviewPage/>
      </MemoryRouter>,
    );

    await user.click(await screen.findByLabelText('Phòng ban'));
    await user.click(await screen.findByRole('option', { name: 'Marketing' }));
    await user.click(screen.getByLabelText('Phòng ban'));
    await user.click(await screen.findByRole('option', { name: 'Kinh doanh' }));
    expect(await screen.findByText('12')).toBeVisible();

    olderRequest.resolve({ ...dashboard, notCreated: 99 });
    await waitFor(() => expect(screen.queryByText('99')).not.toBeInTheDocument());
    expect(screen.getByText('12')).toBeVisible();
  });

  it('retries initialization after the options request fails', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.options)
      .mockRejectedValueOnce(new Error('Mất kết nối'))
      .mockResolvedValue(options);

    render(
      <MemoryRouter>
        <ManagementBscOverviewPage/>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Mất kết nối')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Kỳ BSC')).toBeVisible();
    await waitFor(() => expect(reportsApi.options).toHaveBeenCalledTimes(2));
  });
});
