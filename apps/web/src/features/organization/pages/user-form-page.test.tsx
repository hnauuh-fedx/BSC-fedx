import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rolesApi } from '../../roles/services/roles.service';
import { organizationApi } from '../organization-api';
import { UserFormPage } from './user-form-page';

vi.mock('../organization-api', () => ({
  organizationApi: {
    departmentTree: vi.fn(),
    positions: vi.fn(),
    users: vi.fn(),
    createUser: vi.fn(),
  },
}));
vi.mock('../../roles/services/roles.service', () => ({ rolesApi: { list: vi.fn(), detail: vi.fn() } }));

describe('UserFormPage', () => {
  beforeEach(() => {
    vi.mocked(organizationApi.departmentTree).mockResolvedValue([
      { id: 'department-1', code: 'PNS', name: 'Phòng Nhân sự', parent_id: null, status: 'ACTIVE' },
    ]);
    vi.mocked(organizationApi.positions).mockResolvedValue({
      items: [{ id: 'position-1', code: 'CV', name: 'Chuyên viên', level: 10, status: 'ACTIVE' }],
      page: 1,
      limit: 100,
      total: 1,
    });
    vi.mocked(organizationApi.users).mockResolvedValue({ items: [], page: 1, limit: 100, total: 0 });
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 'role-1', code: 'EMPLOYEE', name: 'Nhân viên', hierarchyLevel: 10, description: 'Lập và theo dõi BSC cá nhân.', isSystem: true, status: 'ACTIVE', permissionCount: 8, createdAt: '', updatedAt: '' },
    ]);
    vi.mocked(rolesApi.detail).mockResolvedValue({
      id: 'role-1', code: 'EMPLOYEE', name: 'Nhân viên', hierarchyLevel: 10, description: 'Lập và theo dõi BSC cá nhân.', isSystem: true, status: 'ACTIVE', createdAt: '', updatedAt: '',
      permissionsByModule: [{ module: 'BSC', permissions: [{ id: 'permission-1', code: 'bsc.view.own', name: 'Xem BSC cá nhân', description: null }] }],
    });
  });

  it('shows position choices and role-permission assignment when creating a user', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/management/users/new']}>
        <Routes><Route path="/management/users/new" element={<UserFormPage />} /></Routes>
      </MemoryRouter>,
    );

    const positionSelect = await screen.findByRole('combobox', { name: 'Chức danh' });
    expect(positionSelect).toHaveTextContent('Chọn chức danh');
    positionSelect.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Chuyên viên' })).toHaveAttribute('title', 'CV · Thứ bậc 10');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: 'Vai trò & Quyền' })).toBeVisible();
    expect(screen.getByText('Quyền được kế thừa từ vai trò đã chọn và được giới hạn theo phạm vi dữ liệu.')).toBeVisible();
    const roleSelect = screen.getByRole('combobox', { name: 'Vai trò' });
    roleSelect.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Nhân viên (EMPLOYEE)' })).toHaveAttribute('title', 'Lập và theo dõi BSC cá nhân.');
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/Xem BSC cá nhân/)).toBeVisible();
  });

  it('creates the user with the selected position, role and permission scope', async () => {
    const user = userEvent.setup();
    vi.mocked(organizationApi.createUser).mockResolvedValue({
      id: 'user-1', employee_code: 'NV001', full_name: 'Nguyễn Văn A', email: 'a@example.test', department_id: 'department-1', position_id: 'position-1', direct_manager_id: null, status: 'ACTIVE',
    });
    render(
      <MemoryRouter initialEntries={['/management/users/new']}>
        <Routes><Route path="/management/users/new" element={<UserFormPage />} /></Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('combobox', { name: 'Chức danh' });
    await user.type(screen.getByRole('textbox', { name: 'Mã nhân viên' }), 'NV001');
    await user.type(screen.getByRole('textbox', { name: 'Họ tên' }), 'Nguyễn Văn A');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'a@example.test');
    await user.type(screen.getByLabelText('Mật khẩu ban đầu'), 'Password!123');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Đơn vị' }), 'department-1');

    const positionSelect = screen.getByRole('combobox', { name: 'Chức danh' });
    positionSelect.focus();
    await user.keyboard('{ArrowDown}{Enter}');
    const roleSelect = screen.getByRole('combobox', { name: 'Vai trò' });
    roleSelect.focus();
    await user.keyboard('{ArrowDown}{Enter}');
    await user.click(screen.getByRole('button', { name: 'Lưu người dùng' }));

    expect(organizationApi.createUser).toHaveBeenCalledWith({
      employeeCode: 'NV001', fullName: 'Nguyễn Văn A', email: 'a@example.test', password: 'Password!123', departmentId: 'department-1', positionId: 'position-1', directManagerId: null, roleId: 'role-1', roleScopeType: 'SELF',
    });
  });
});
