import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentBscApi } from '../department-bsc.service';
import type { DepartmentBsc } from '../department-bsc.types';
import { DepartmentBscPendingReviewPage } from './department-bsc-pages';

vi.mock('../department-bsc.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../department-bsc.service')>();
  return { ...actual, departmentBscApi: {
    pendingReview: vi.fn(), pendingReopen: vi.fn(), approvePlan: vi.fn(), approveEvaluation: vi.fn(),
    returnPlan: vi.fn(), returnEvaluation: vi.fn(), approveReopen: vi.fn(), rejectReopen: vi.fn(),
  } };
});

const pending = {
  id: 'department-bsc-1', plan_status: 'SUBMITTED', evaluation_status: 'NOT_STARTED',
  plan_submitted_at: '2026-09-01T00:00:00.000Z', evaluation_submitted_at: null,
  bsc_cycles: { id: 'cycle-1', name: 'Tháng 9/2026', code: 'T9', year: 2026, month: 9, status: 'OPEN' },
  departments: { id: 'department-1', code: 'MKT', name: 'Marketing' },
  responsible_manager: { id: 'manager-1', employee_code: 'M001', full_name: 'Trưởng phòng Marketing' },
  review_capabilities: { canApprovePlan: true, canReturnPlan: true, canApproveEvaluation: false,
    canReturnEvaluation: false, canResetPlan: false, canResetEvaluation: false },
} as DepartmentBsc;

describe('DepartmentBscPendingReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(departmentBscApi.pendingReview).mockResolvedValue({ items: [pending], page: 1, limit: 20, total: 1,
      filterOptions: { cycles: [{ id: 'cycle-1', name: 'Tháng 9/2026' }], departments: [{ id: 'department-1', name: 'Marketing' }] } });
    vi.mocked(departmentBscApi.pendingReopen).mockResolvedValue({ items: [{
      id: 'reopen-1', department_bsc_id: pending.id, stage: 'PLAN', status: 'PENDING', request_reason: 'Điều chỉnh kế hoạch',
      request_source: 'OWNER_REQUEST', review_reason: null, created_at: '2026-09-02T00:00:00.000Z', reviewed_at: null,
      review_capabilities: { canApproveReopen: true, canRejectReopen: false }, department_bsc: pending,
    }], page: 1, limit: 20, total: 1,
      filterOptions: { cycles: [], departments: [] } });
    vi.mocked(departmentBscApi.approvePlan).mockResolvedValue(pending);
  });

  it('shows all stages as direct tabs and exposes inline review actions from backend capabilities', async () => {
    render(<MemoryRouter><DepartmentBscPendingReviewPage /></MemoryRouter>);

    expect(await screen.findByRole('tab', { name: 'Chờ duyệt kế hoạch' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Chờ duyệt đánh giá' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Yêu cầu mở lại' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Giai đoạn' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trả lại' })).toBeVisible();
  });

  it('requires confirmation before approving directly from the queue', async () => {
    render(<MemoryRouter><DepartmentBscPendingReviewPage /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    expect(screen.getByRole('dialog', { name: 'Duyệt kế hoạch BSC phòng ban' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt' }));

    await waitFor(() => expect(departmentBscApi.approvePlan).toHaveBeenCalledWith('department-bsc-1'));
  });

  it('uses backend capabilities for reopen-request actions', async () => {
    render(<MemoryRouter><DepartmentBscPendingReviewPage /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('tab', { name: 'Yêu cầu mở lại' }));
    expect(await screen.findByRole('button', { name: 'Chấp thuận' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
  });
});
