import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '../../../app/store/auth-store';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';
import { BscPendingReviewPage } from './bsc-pending-review-page';

vi.mock('../../../app/store/auth-store', () => ({ useAuthContext: vi.fn() }));
vi.mock('../services/employee-bsc.service', () => ({
  employeeBscApi: {
    pendingReview: vi.fn(),
    approvePlan: vi.fn(),
    approveEvaluation: vi.fn(),
    returnPlan: vi.fn(),
    returnEvaluation: vi.fn(),
  },
}));

const pendingBsc: EmployeeBsc = {
  id: 'bsc-1',
  bsc_code: 'BSC_NV001_CE23CCEF16FC',
  cycle_id: 'cycle-1',
  employee_id: 'employee-1',
  department_id: 'department-1',
  position_id: 'position-1',
  direct_manager_id: 'manager-1',
  status: 'SUBMITTED',
  employee_comment: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  plan_status: 'SUBMITTED',
  evaluation_status: 'NOT_STARTED',
  plan_submitted_at: '2026-07-22T08:44:00.000Z',
  bsc_cycles: { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN', end_date: null },
  users_employee_bsc_employee_idTousers: { id: 'employee-1', employee_code: 'E001', full_name: 'Nhân viên thử nghiệm', email: 'employee@example.com' },
  users_employee_bsc_direct_manager_idTousers: { id: 'manager-1', employee_code: 'M001', full_name: 'Quản lý thử nghiệm' },
  departments: { id: 'department-1', code: 'D001', name: 'Đơn vị thử nghiệm' },
  employee_bsc_items: [],
  goal_groups: [],
  bsc_status_histories: [],
};

describe('BscPendingReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'director-1',
          employeeCode: 'D001',
          fullName: 'Giám đốc thử nghiệm',
          email: 'director@example.com',
          status: 'ACTIVE',
          roles: [],
          permissions: [
            BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
            BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
          ],
        },
        accessToken: 'token',
        expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.pendingReview).mockResolvedValue({
      items: [pendingBsc],
      page: 1,
      limit: 10,
      total: 1,
      filterOptions: {
        cycles: [{ id: 'cycle-1', name: 'Tháng 7/2026', status: 'OPEN' }],
        departments: [{ id: 'department-1', code: 'D001', name: 'Đơn vị thử nghiệm' }],
      },
    });
  });

  it('dùng tên hồ sơ tự nhiên trong bảng và các hộp thoại xử lý', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><BscPendingReviewPage /></MemoryRouter>);

    expect(await screen.findByRole('columnheader', { name: 'Hồ sơ BSC' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'BSC Tháng 7/2026' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('BSC_NV001_CE23CCEF16FC')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Mã BSC' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Duyệt' })[0]);

    expect(
      screen.getByRole('heading', {
        name: 'Duyệt kế hoạch BSC Tháng 7/2026 của Nhân viên thử nghiệm',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    await user.click(screen.getAllByRole('button', { name: 'Trả lại' })[0]);

    expect(
      screen.getByRole('heading', {
        name: 'Trả lại kế hoạch BSC Tháng 7/2026 của Nhân viên thử nghiệm',
      }),
    ).toBeVisible();
  });
});
