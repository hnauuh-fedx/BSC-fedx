import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/hooks/use-auth';
import { reportsApi } from '../reports-api';
import { BscReportPage } from './bsc-report-page';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../reports-api', () => ({ reportsApi: { options: vi.fn(), list: vi.fn(), export: vi.fn() } }));

const row = {
  id: 'bsc-1', bscCode: 'BSC-HIDDEN', employeeId: 'employee-1', employeeCode: 'NV001', employeeName: 'Nguyễn Văn A',
  departmentId: 'department-1', departmentName: 'Marketing', positionName: 'Nhân viên', directManagerName: 'Trưởng phòng',
  cycleId: 'cycle-1', cycleCode: 'T7', cycleName: 'Tháng 7', planStatus: 'APPROVED', evaluationStatus: 'APPROVED',
  totalWeight: '100', kpiCount: 5, officialScore: '94', officialGrade: 'A', planApprovedAt: null, evaluationApprovedAt: null,
};

describe('BscReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null, isAuthenticated: true, isLoading: false, status: 'authenticated',
      login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(() => 'token'),
    });
    vi.mocked(reportsApi.options).mockResolvedValue({ cycles: [], departments: [], employees: [{ id: 'employee-1', employee_code: 'NV001', full_name: 'Nguyễn Văn A', department_id: 'department-1' }] });
    vi.mocked(reportsApi.list).mockResolvedValue({ items: [row], page: 1, limit: 20, total: 1 });
  });

  const DetailProbe = () => <p>Chi tiết BSC đã mở: {useParams().id}</p>;
  const renderPage = () => render(<MemoryRouter initialEntries={['/reports/bsc']}><Routes>
    <Route path="/reports/bsc" element={<BscReportPage/>}/>
    <Route path="/employee-bsc/:id" element={<DetailProbe/>}/>
  </Routes></MemoryRouter>);

  it('hides employee and BSC codes and opens detail when clicking a row', async () => {
    const user = userEvent.setup(); renderPage();
    const detailLink = await screen.findByRole('link', { name: 'Xem BSC của Nguyễn Văn A kỳ Tháng 7' });
    const reportRow = detailLink.closest('tr');
    expect(screen.queryByRole('columnheader', { name: 'Mã nhân viên' })).not.toBeInTheDocument();
    expect(screen.queryByText('NV001')).not.toBeInTheDocument();
    expect(screen.queryByText('BSC-HIDDEN')).not.toBeInTheDocument();
    expect(reportRow).not.toBeNull();
    await user.click(reportRow!);
    expect(await screen.findByText('Chi tiết BSC đã mở: bsc-1')).toBeVisible();
  });

  it('opens detail with the keyboard', async () => {
    const user = userEvent.setup(); renderPage();
    const detailLink = await screen.findByRole('link', { name: 'Xem BSC của Nguyễn Văn A kỳ Tháng 7' });
    detailLink.focus(); await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByText('Chi tiết BSC đã mở: bsc-1')).toBeVisible());
  });
});
