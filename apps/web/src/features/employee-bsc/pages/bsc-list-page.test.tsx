import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '../../../app/store/auth-store';
import { BSC_PERMISSIONS } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { EmployeeBsc } from '../types/employee-bsc.types';
import { BscListPage } from './bsc-list-page';

vi.mock('../../auth/components/permission-gate', () => ({ PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../../../app/store/auth-store', () => ({ useAuthContext: vi.fn() }));
vi.mock('../services/employee-bsc.service', () => ({
  employeeBscApi: {
    list: vi.fn(),
    duplicateOptions: vi.fn(),
    duplicate: vi.fn(),
    exportExcel: vi.fn(),
  },
}));

const bsc: EmployeeBsc = {
  id: 'bsc-1', bsc_code: 'BSC-MANAGER', cycle_id: 'cycle-1', employee_id: 'manager-1', department_id: 'department-1', position_id: 'position-1', direct_manager_id: 'director-1',
  status: 'DRAFT', employee_comment: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED',
  bsc_cycles: { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' },
  users_employee_bsc_employee_idTousers: { id: 'manager-1', employee_code: 'NV002', full_name: 'Trưởng Phòng', email: 'manager@example.com' },
  departments: { id: 'department-1', code: 'MKT', name: 'Marketing' },
};

describe('BscListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'manager-1', employeeCode: 'M001', fullName: 'Trưởng phòng', email: 'manager@example.com', status: 'ACTIVE',
          roles: [
            { code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: [] },
            { code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: 'department-1', permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.REVIEW_REOPEN] },
          ],
          permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.REVIEW_REOPEN],
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(employeeBscApi.list).mockResolvedValue({ items: [bsc], page: 1, limit: 20, total: 1 });
    vi.mocked(employeeBscApi.duplicateOptions).mockResolvedValue({
      sourceBscId: bsc.id,
      sourceVersion: null,
      cycles: [{ id: 'cycle-2', code: 'T8', name: 'Tháng 8/2026', year: 2026, month: 8, status: 'OPEN', start_date: '2026-08-01T00:00:00.000Z' }],
      suggestedCycleId: 'cycle-2',
    });
  });

  it('loads only the current user BSCs and shows the requested action columns', async () => {
    render(<MemoryRouter><BscListPage/></MemoryRouter>);

    expect(await screen.findByText('Tháng 7/2026')).toBeVisible();
    await waitFor(() => expect(employeeBscApi.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'OWN' })));
    expect(screen.queryByRole('columnheader', { name: 'Mã BSC' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Nhân viên' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'KPI' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Thao tác' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/employee-bsc/bsc-1');
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'In BSC' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sao chép BSC' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'BSC chờ duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Yêu cầu mở lại' })).not.toBeInTheDocument();
  });

  it('downloads the selected personal BSC as Excel', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:list-export');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.mocked(employeeBscApi.exportExcel).mockResolvedValue({ blob: new Blob(['excel']), fileName: 'personal-bsc.xlsx' });
    render(<MemoryRouter><BscListPage/></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(employeeBscApi.exportExcel).toHaveBeenCalledWith('manager-1', 'cycle-1'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:list-export');
    createObjectURL.mockRestore(); revokeObjectURL.mockRestore(); click.mockRestore();
  });

  it('shows reviewer links only to a GLOBAL DIRECTOR', async () => {
    vi.mocked(useAuthContext).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: 'director-1', employeeCode: 'D001', fullName: 'Giám đốc', email: 'director@example.com', status: 'ACTIVE',
          roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.REVIEW_REOPEN] }],
          permissions: [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.REVIEW_REOPEN],
        },
        accessToken: 'token', expiresAt: Date.now() + 60_000,
      },
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });

    render(<MemoryRouter><BscListPage/></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'BSC chờ duyệt' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Yêu cầu mở lại' })).toBeVisible();
  });

  it('explains that duplicate creates a blank BSC when version 1 is absent', async () => {
    render(<MemoryRouter><BscListPage/></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Sao chép BSC' }));

    expect(await screen.findByText('BSC nguồn chưa có phiên bản 1; BSC mới sẽ để trống.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Kỳ đích' })).toHaveTextContent('Tháng 8/2026');
  });

  it('distinguishes an available source version from a missing target cycle', async () => {
    vi.mocked(employeeBscApi.duplicateOptions).mockResolvedValueOnce({
      sourceBscId: bsc.id,
      sourceVersion: {
        id: 'version-1', versionNumber: 1, stage: 'PLAN', versionType: 'PLAN_APPROVED',
        createdAt: '2026-07-20T00:00:00.000Z',
        createdBy: { id: 'director-1', employee_code: 'GD001', full_name: 'Giám đốc' },
        sourceReviewId: 'review-1', sourceReopenRequestId: null,
        summary: { itemCount: 6, totalWeight: 100, totalScore: 94, finalGrade: 'A' },
      },
      cycles: [],
      suggestedCycleId: null,
    });

    render(<MemoryRouter><BscListPage/></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Sao chép BSC' }));

    expect(await screen.findByText('BSC nguồn có dữ liệu: phiên bản 1 · 6 KPI · tổng tỷ trọng 100%.')).toBeVisible();
    expect(screen.getByText(/Chưa có kỳ tháng nào sau Tháng 7\/2026 đang mở/)).toBeVisible();
    expect(screen.queryByText('Chưa có dữ liệu')).not.toBeInTheDocument();
  });
});
