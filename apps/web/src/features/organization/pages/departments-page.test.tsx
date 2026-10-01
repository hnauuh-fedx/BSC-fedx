import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '../organization-api';
import { DepartmentsPage } from './departments-page';

vi.mock('../organization-api', () => ({
  organizationApi: {
    departments: vi.fn(),
    departmentTree: vi.fn(),
    createDepartment: vi.fn(),
    departmentStatus: vi.fn(),
  },
}));
vi.mock('../../auth/components/permission-gate', () => ({ PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</> }));

describe('DepartmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationApi.departments).mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    vi.mocked(organizationApi.departmentTree).mockResolvedValue([]);
    vi.mocked(organizationApi.createDepartment).mockResolvedValue({ id: 'department-1', code: 'DV000001', name: 'Marketing', parent_id: null, status: 'ACTIVE' });
  });

  it('creates a department without asking for a code', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DepartmentsPage /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Thêm đơn vị' });
    expect(screen.queryByLabelText('Mã')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên'), 'Marketing');
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị' }));

    await waitFor(() => expect(organizationApi.createDepartment).toHaveBeenCalledWith({ name: 'Marketing', parentId: null }));
  });
});
