import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/hooks/use-auth';
import { reportsApi } from '../../reports/reports-api';
import { exportMinutesToPdf } from '../bsc-minutes-pdf';
import { BscMinutesPage } from './bsc-minutes-page';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../../auth/components/permission-gate', () => ({ PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../../reports/reports-api', () => ({ reportsApi: { options: vi.fn(), list: vi.fn() } }));
vi.mock('../bsc-minutes-pdf', () => ({ exportMinutesToPdf: vi.fn().mockResolvedValue(undefined) }));

describe('BscMinutesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'director-1', employeeCode: 'GD01', fullName: 'Giám đốc', email: 'director@example.com', status: 'ACTIVE',
        roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null }], permissions: ['bsc.minutes.create'],
      },
      isAuthenticated: true, isLoading: false, status: 'authenticated', login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(),
    });
    vi.mocked(reportsApi.options).mockResolvedValue({
      cycles: [{ id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' }],
      departments: [{ id: 'department-1', name: 'Marketing' }, { id: 'department-2', name: 'Kinh doanh' }],
      employees: [
        { id: 'employee-1', employee_code: 'NV01', full_name: 'Nguyễn Văn A', department_id: 'department-1' },
        { id: 'employee-2', employee_code: 'NV02', full_name: 'Trần Thị B', department_id: 'department-2' },
      ],
    });
    vi.mocked(reportsApi.list).mockResolvedValue({
      items: [{
        id: 'bsc-1', bscCode: 'BSC-1', employeeId: 'employee-1', employeeCode: 'NV01', employeeName: 'Nguyễn Văn A',
        departmentId: 'department-1', departmentName: 'Marketing', positionName: 'Nhân viên', directManagerName: 'Trưởng phòng',
        cycleId: 'cycle-1', cycleCode: 'T7', cycleName: 'Tháng 7/2026', planStatus: 'APPROVED', evaluationStatus: 'APPROVED',
        totalWeight: '100', kpiCount: 5, officialScore: '94', officialGrade: 'A', planApprovedAt: null, evaluationApprovedAt: '2026-07-20T00:00:00.000Z',
      }, {
        id: 'bsc-2', bscCode: 'BSC-2', employeeId: 'employee-2', employeeCode: 'NV02', employeeName: 'Trần Thị B',
        departmentId: 'department-2', departmentName: 'Kinh doanh', positionName: 'Nhân viên', directManagerName: 'Trưởng phòng',
        cycleId: 'cycle-1', cycleCode: 'T7', cycleName: 'Tháng 7/2026', planStatus: 'APPROVED', evaluationStatus: 'APPROVED',
        totalWeight: '100', kpiCount: 4, officialScore: '102', officialGrade: 'A+', planApprovedAt: null, evaluationApprovedAt: '2026-07-20T00:00:00.000Z',
      }],
      page: 1, limit: 100, total: 2,
    });
  });

  it('prefills the director meeting template from approved BSC results', async () => {
    render(<BscMinutesPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Biên bản họp đánh giá BSC' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Chủ trì' })).toHaveValue('Giám đốc');
    expect((await screen.findAllByRole('cell', { name: 'Nguyễn Văn A' }))[0]).toBeVisible();
    expect((await screen.findAllByRole('cell', { name: 'Trần Thị B' }))[0]).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Phòng ban' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Tên đơn vị' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Thành viên vắng và lý do' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: '94' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('cell', { name: 'A' }).length).toBeGreaterThan(0);
    await waitFor(() => expect(reportsApi.list).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: 'cycle-1', evaluationStatus: 'APPROVED', limit: 100,
    })));
    expect(vi.mocked(reportsApi.list).mock.calls[0][0]).not.toHaveProperty('departmentId');
  });

  it('prints the completed minutes from the shared template', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<BscMinutesPage />);

    await screen.findAllByRole('cell', { name: 'Nguyễn Văn A' });
    await user.type(screen.getByRole('spinbutton', { name: 'Số biên bản' }), '63');
    await user.type(screen.getByRole('textbox', { name: 'Nơi họp' }), 'B11.204');
    await user.type(screen.getByRole('textbox', { name: 'Giao chỉ tiêu tháng tới' }), 'Kèm theo bảng BSC của cá nhân và đơn vị.');
    await user.type(screen.getByRole('textbox', { name: 'Kết luận' }), 'Nội dung Biên bản đã được thông qua.');

    const printedMinutes = screen.getByRole('article', { name: 'Bản in biên bản đánh giá BSC' });
    expect(printedMinutes).toHaveTextContent('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
    expect(printedMinutes).toHaveTextContent('CÔNG TY TNHH MTV CÔNG NGHỆ FEDX');
    expect(printedMinutes.querySelectorAll('.minutes-print-heading-line')).toHaveLength(3);
    expect(printedMinutes).toHaveTextContent('Số: 63 / BB-FEDX');
    expect(printedMinutes).toHaveTextContent('Tại B11.204');
    expect(printedMinutes).toHaveTextContent('Kèm theo bảng BSC của cá nhân và đơn vị.');
    expect(printedMinutes).toHaveTextContent('Nội dung Biên bản đã được thông qua.');
    await user.click(screen.getByRole('button', { name: 'In biên bản' }));

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('downloads the completed minutes as a PDF file', async () => {
    const user = userEvent.setup();
    render(<BscMinutesPage />);

    await screen.findAllByRole('cell', { name: 'Nguyễn Văn A' });
    await user.type(screen.getByRole('spinbutton', { name: 'Số biên bản' }), '63');
    await user.click(screen.getByRole('button', { name: 'Lưu PDF' }));

    await waitFor(() => expect(exportMinutesToPdf).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'bien-ban-T7-63.pdf',
    ));
  });
});
