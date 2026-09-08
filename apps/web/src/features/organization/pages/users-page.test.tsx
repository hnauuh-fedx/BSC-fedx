import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemConfirmDialogProvider } from '../../../components/system-confirm-dialog';
import { organizationApi } from '../organization-api';
import { UsersPage } from './users-page';

vi.mock('../../auth/components/permission-gate', () => ({
  PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../organization-api', () => ({
  organizationApi: {
    users: vi.fn(),
    userFilterOptions: vi.fn(),
    userStatus: vi.fn(),
  },
}));

const userPage = (id: string, fullName: string) => ({
  items: [{
    id, employee_code: id, username: id, full_name: fullName,
    email: `${id}@example.test`, department_id: 'department-1', position_id: 'position-1',
    direct_manager_id: 'manager-1', status: 'ACTIVE', departments: { name: 'Marketing' }, positions: { name: 'Chuyên viên' },
  }],
  page: 1, limit: 20, total: 1,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
};

describe('UsersPage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationApi.users).mockResolvedValue({
      items: [{
        id: 'user-1', employee_code: 'NV001', username: 'nguyenvana', full_name: 'Nguyễn Văn A',
        email: 'a@example.test', department_id: 'department-1', position_id: 'position-1',
        direct_manager_id: null, status: 'ACTIVE', departments: { name: 'Marketing' }, positions: { name: 'Chuyên viên' },
      }],
      page: 1, limit: 20, total: 1,
    });
    vi.mocked(organizationApi.userFilterOptions).mockResolvedValue({
      departments: [{ id: 'department-1', code: 'MKT', name: 'Marketing', status: 'ACTIVE' }],
      positions: [{ id: 'position-1', code: 'CV', name: 'Chuyên viên', level: 1, status: 'ACTIVE' }],
      directManagers: [{ id: 'manager-1', employee_code: 'QL001', full_name: 'Trưởng phòng Marketing', status: 'ACTIVE' }],
    });
  });

  const renderPage = () => render(
    <SystemConfirmDialogProvider><MemoryRouter><UsersPage /></MemoryRouter></SystemConfirmDialogProvider>,
  );

  it('filters users by department, position and direct manager and can reset all filters', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(organizationApi.users).toHaveBeenCalled());
    expect(organizationApi.userFilterOptions).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('combobox', { name: 'Đơn vị' }));
    await user.click(await screen.findByRole('option', { name: 'Marketing' }));
    await user.click(screen.getByRole('combobox', { name: 'Chức danh' }));
    await user.click(await screen.findByRole('option', { name: 'Chuyên viên' }));
    await user.click(screen.getByRole('combobox', { name: 'Quản lý trực tiếp' }));
    await user.click(await screen.findByRole('option', { name: 'Trưởng phòng Marketing (QL001)' }));

    await waitFor(() => expect(organizationApi.users).toHaveBeenLastCalledWith(expect.objectContaining({
      departmentId: 'department-1',
      positionId: 'position-1',
      directManagerId: 'manager-1',
      page: 1,
    })));

    await user.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
    await waitFor(() => expect(organizationApi.users).toHaveBeenLastCalledWith(expect.objectContaining({
      departmentId: '',
      positionId: '',
      directManagerId: '',
      status: '',
      search: '',
      page: 1,
    })));
  });

  it('keeps the user list usable when filter options cannot be loaded', async () => {
    vi.mocked(organizationApi.userFilterOptions).mockRejectedValueOnce(new Error('Không có dữ liệu bộ lọc'));

    renderPage();

    expect((await screen.findAllByText('Nguyễn Văn A')).length).toBeGreaterThan(0);
    expect(screen.getByText('Không thể tải đầy đủ bộ lọc')).toBeInTheDocument();
    expect(screen.getByText('Không có dữ liệu bộ lọc')).toBeInTheDocument();
  });

  it('does not let an older filter request overwrite the latest result', async () => {
    const older = deferred<ReturnType<typeof userPage>>();
    const latest = deferred<ReturnType<typeof userPage>>();
    vi.mocked(organizationApi.users).mockImplementation(params => {
      if (params.departmentId === 'department-1' && params.positionId === 'position-1') return latest.promise;
      if (params.departmentId === 'department-1') return older.promise;
      return Promise.resolve(userPage('initial-user', 'Kết quả ban đầu'));
    });
    const user = userEvent.setup();
    renderPage();
    expect((await screen.findAllByText('Kết quả ban đầu')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('combobox', { name: 'Đơn vị' }));
    await user.click(await screen.findByRole('option', { name: 'Marketing' }));
    await user.click(screen.getByRole('combobox', { name: 'Chức danh' }));
    await user.click(await screen.findByRole('option', { name: 'Chuyên viên' }));

    latest.resolve(userPage('latest-user', 'Kết quả mới nhất'));
    expect((await screen.findAllByText('Kết quả mới nhất')).length).toBeGreaterThan(0);
    older.resolve(userPage('older-user', 'Kết quả cũ'));
    await waitFor(() => expect(screen.queryAllByText('Kết quả cũ')).toHaveLength(0));
    expect(screen.getAllByText('Kết quả mới nhất').length).toBeGreaterThan(0);
  });

  it('refreshes a completed status action with the latest filters', async () => {
    const statusAction = deferred<Awaited<ReturnType<typeof organizationApi.userStatus>>>();
    vi.mocked(organizationApi.userStatus).mockReturnValue(statusAction.promise);
    const user = userEvent.setup();
    renderPage();
    expect((await screen.findAllByText('Nguyễn Văn A')).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Khóa' })[0]);
    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(organizationApi.userStatus).toHaveBeenCalledWith('user-1', 'lock'));

    await user.click(screen.getByRole('combobox', { name: 'Đơn vị' }));
    await user.click(await screen.findByRole('option', { name: 'Marketing' }));
    await waitFor(() => expect(organizationApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ departmentId: 'department-1' })));

    const callsBeforeStatusCompletes = vi.mocked(organizationApi.users).mock.calls.length;
    statusAction.resolve(userPage('user-1', 'Nguyễn Văn A').items[0]);
    await waitFor(() => expect(vi.mocked(organizationApi.users).mock.calls.length).toBeGreaterThan(callsBeforeStatusCompletes));
    expect(organizationApi.users).toHaveBeenLastCalledWith(expect.objectContaining({
      search: '', status: '', departmentId: 'department-1', positionId: '', directManagerId: '', page: 1,
    }));
  });
});
