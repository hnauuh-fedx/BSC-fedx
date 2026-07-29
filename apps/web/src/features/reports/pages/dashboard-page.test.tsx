import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/hooks/use-auth';
import { reportsApi } from '../reports-api';
import { DashboardData } from '../reports.types';
import { DashboardPage } from './dashboard-page';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../reports-api', () => ({
  reportsApi: { dashboard: vi.fn() },
}));

const data: DashboardData = {
  kind: 'EMPLOYEE',
  currentCycle: null,
  currentBsc: null,
  actions: [],
  recentBsc: [{
    id: 'bsc-1',
    bscCode: 'BSC_NV001_CE23CCEF16FC',
    employeeId: 'employee-1',
    employeeCode: 'E001',
    employeeName: 'Nhân viên thử nghiệm',
    departmentId: 'department-1',
    departmentName: 'Đơn vị thử nghiệm',
    positionName: 'Nhân viên',
    directManagerName: 'Quản lý thử nghiệm',
    cycleId: 'cycle-1',
    cycleCode: 'T6',
    cycleName: 'Tháng 6/2026',
    planStatus: 'APPROVED',
    evaluationStatus: 'APPROVED',
    totalWeight: '100',
    kpiCount: 3,
    officialScore: '95',
    officialGrade: 'A',
    planApprovedAt: '2026-06-10T00:00:00.000Z',
    evaluationApprovedAt: '2026-06-30T00:00:00.000Z',
  }],
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'employee-1',
        employeeCode: 'E001',
        fullName: 'Nhân viên thử nghiệm',
        email: 'employee@example.com',
        status: 'ACTIVE',
        roles: [],
        permissions: [],
      },
      isAuthenticated: true,
      isLoading: false,
      status: 'authenticated',
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(reportsApi.dashboard).mockResolvedValue(data);
  });

  it('dùng kỳ làm liên kết và không hiển thị mã BSC kỹ thuật', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Tháng 6/2026' })).toHaveAttribute(
      'href',
      '/employee-bsc/bsc-1',
    );
    expect(screen.queryByRole('columnheader', { name: 'Mã BSC' })).not.toBeInTheDocument();
    expect(screen.queryByText('BSC_NV001_CE23CCEF16FC')).not.toBeInTheDocument();
  });
});
