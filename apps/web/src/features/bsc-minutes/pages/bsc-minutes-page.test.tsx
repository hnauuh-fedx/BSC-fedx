import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/hooks/use-auth';
import { departmentBscApi } from '../../department-bsc/department-bsc.service';
import { reportsApi } from '../../reports/reports-api';
import { REPORT_GRADE_OPTIONS } from '../../reports/report-test-fixtures';
import { exportMinutesToPdf } from '../bsc-minutes-pdf';
import { BscMinutesPage } from './bsc-minutes-page';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../../auth/components/permission-gate', () => ({ PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../../department-bsc/department-bsc.service', () => ({
  departmentBscApi: { list: vi.fn() },
  DEPARTMENT_BSC_PERMISSIONS: { VIEW: 'bsc.department.view' },
}));
vi.mock('../../reports/reports-api', () => ({ reportsApi: { options: vi.fn(), list: vi.fn() } }));
vi.mock('../bsc-minutes-pdf', () => ({ exportMinutesToPdf: vi.fn().mockResolvedValue(undefined) }));

describe('BscMinutesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'director-1', employeeCode: 'GD01', fullName: 'Giám đốc', email: 'director@example.com', status: 'ACTIVE',
        roles: [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null }], permissions: ['bsc.minutes.create', 'bsc.department.view'],
      },
      isAuthenticated: true, isLoading: false, status: 'authenticated', login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(),
    });
    vi.mocked(reportsApi.options).mockResolvedValue({
      capabilities: { canViewPersonal: false, canViewManagement: true, canExportPersonal: false, canExportManagement: true, defaultScope: 'MANAGEMENT' },
      grades: REPORT_GRADE_OPTIONS,
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
    vi.mocked(departmentBscApi.list).mockResolvedValue({
      items: [{
        id: 'department-bsc-1', bsc_code: 'DBSC-MKT', cycle_id: 'cycle-1', department_id: 'department-1',
        responsible_manager_id: 'manager-1', reviewer_id: 'director-1', source_bsc_id: null,
        manager_comment: 'Hoàn thành kế hoạch phòng', director_comment: 'Giữ nguyên xếp loại',
        plan_status: 'APPROVED', evaluation_status: 'APPROVED', plan_submitted_at: null, plan_approved_at: null,
        evaluation_submitted_at: null, evaluation_approved_at: '2026-07-20T00:00:00.000Z', total_score: 96,
        final_score: 96, final_grade: 'A', created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
        bsc_cycles: { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' },
        departments: { id: 'department-1', code: 'MKT', name: 'Marketing' },
        responsible_manager: { id: 'manager-1', employee_code: 'TP01', full_name: 'Trưởng phòng Marketing' },
        reviewer: { id: 'director-1', employee_code: 'GD01', full_name: 'Giám đốc' },
        department_bsc_items: [], department_bsc_status_histories: [], department_bsc_reviews: [], goal_groups: [],
      }],
      page: 1, limit: 100, total: 1,
    });
  });

  it('prefills the director meeting template from approved BSC results', async () => {
    render(<BscMinutesPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Biên bản họp đánh giá BSC' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Nơi họp' })).toHaveValue('B11.204');
    expect(screen.getByRole('textbox', { name: 'Chủ trì' })).toHaveValue('Hồ Minh Hải');
    expect(screen.getByRole('combobox', { name: 'Thư ký' })).toHaveTextContent('Lâm Sơn Điền');
    expect((await screen.findAllByRole('cell', { name: 'Nguyễn Văn A' }))[0]).toBeVisible();
    expect((await screen.findAllByRole('cell', { name: 'Trần Thị B' }))[0]).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Phòng ban' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Tên đơn vị' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Thành viên vắng và lý do' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: '94' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('cell', { name: 'A' }).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Tập thể · Marketing')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('cell', { name: '96' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('cell', { name: 'Giữ nguyên xếp loại' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('article', { name: 'Bản in biên bản đánh giá BSC' })).toHaveTextContent('Marketing');
    await waitFor(() => expect(reportsApi.list).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: 'cycle-1', evaluationStatus: 'APPROVED', limit: 100,
    })));
    expect(vi.mocked(reportsApi.list).mock.calls[0][0]).not.toHaveProperty('departmentId');
    expect(departmentBscApi.list).toHaveBeenCalledWith({
      cycleId: 'cycle-1', evaluationStatus: 'APPROVED', page: 1, limit: 100,
    });
  });

  it('restores the meeting defaults when resetting the form', async () => {
    const user = userEvent.setup();
    render(<BscMinutesPage />);

    const location = await screen.findByRole('textbox', { name: 'Nơi họp' });
    const chair = screen.getByRole('textbox', { name: 'Chủ trì' });
    const secretary = screen.getByRole('combobox', { name: 'Thư ký' });
    await user.clear(location);
    await user.type(location, 'Phòng khác');
    await user.clear(chair);
    await user.type(chair, 'Chủ trì khác');
    await user.click(secretary);
    await user.click(screen.getByRole('option', { name: 'Nguyễn Văn A' }));

    await user.click(screen.getByRole('button', { name: 'Làm lại' }));

    expect(location).toHaveValue('B11.204');
    expect(chair).toHaveValue('Hồ Minh Hải');
    expect(secretary).toHaveTextContent('Lâm Sơn Điền');
  });

  it('prints the completed minutes from the shared template', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<BscMinutesPage />);

    await screen.findAllByRole('cell', { name: 'Nguyễn Văn A' });
    await user.type(screen.getByRole('spinbutton', { name: 'Số biên bản' }), '63');
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

  it('keeps individual results visible when department BSC loading fails', async () => {
    vi.mocked(departmentBscApi.list).mockRejectedValueOnce(new Error('Không thể tải BSC phòng ban'));

    render(<BscMinutesPage />);

    expect((await screen.findAllByRole('cell', { name: 'Nguyễn Văn A' }))[0]).toBeVisible();
    expect(await screen.findByText('Không thể tải BSC phòng ban')).toBeVisible();
    expect(screen.getByRole('button', { name: 'In biên bản' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu PDF' })).toBeDisabled();
    expect(screen.queryByRole('article', { name: 'Bản in biên bản đánh giá BSC' })).not.toBeInTheDocument();
  });

  it('loads every department BSC page for the selected cycle', async () => {
    vi.mocked(departmentBscApi.list).mockImplementation(async (params) => ({
      items: [], page: Number(params?.page), limit: 100, total: 101,
    }));

    render(<BscMinutesPage />);

    await waitFor(() => expect(departmentBscApi.list).toHaveBeenCalledWith({
      cycleId: 'cycle-1', evaluationStatus: 'APPROVED', page: 2, limit: 100,
    }));
  });

  it('blocks export while changing cycles and ignores a stale response', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.options).mockResolvedValue({
      capabilities: { canViewPersonal: false, canViewManagement: true, canExportPersonal: false, canExportManagement: true, defaultScope: 'MANAGEMENT' },
      grades: REPORT_GRADE_OPTIONS,
      cycles: [
        { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' },
        { id: 'cycle-2', code: 'T8', name: 'Tháng 8/2026', year: 2026, month: 8, status: 'LOCKED' },
      ],
      departments: [], employees: [],
    });
    let rejectStale!: (reason: Error) => void;
    const staleRequest = new Promise<Awaited<ReturnType<typeof reportsApi.list>>>((_, reject) => { rejectStale = reject; });
    let resolveCurrent!: (value: Awaited<ReturnType<typeof reportsApi.list>>) => void;
    const currentRequest = new Promise<Awaited<ReturnType<typeof reportsApi.list>>>((resolve) => { resolveCurrent = resolve; });
    vi.mocked(reportsApi.list).mockImplementation((params) => params?.cycleId === 'cycle-1'
      ? staleRequest
      : currentRequest);

    render(<BscMinutesPage />);
    await user.click(await screen.findByRole('combobox', { name: 'Kỳ BSC' }));
    await user.click(screen.getByRole('option', { name: 'Tháng 8/2026' }));

    expect(screen.getByRole('button', { name: 'In biên bản' })).toBeDisabled();
    await act(async () => { resolveCurrent({ items: [], page: 1, limit: 100, total: 0 }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'In biên bản' })).toBeEnabled());
    await act(async () => { rejectStale(new Error('Phản hồi cũ không được hiển thị')); });
    expect(screen.queryByText('Phản hồi cũ không được hiển thị')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In biên bản' })).toBeEnabled();
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
