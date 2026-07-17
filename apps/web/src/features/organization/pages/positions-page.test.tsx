import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '../organization-api';
import { PositionsPage } from './positions-page';

vi.mock('../../auth/components/permission-gate', () => ({ PermissionGate: ({ children }: React.PropsWithChildren) => <>{children}</> }));
vi.mock('../organization-api', () => ({
  organizationApi: {
    positions: vi.fn(), createPosition: vi.fn(), positionStatus: vi.fn(),
  },
}));

describe('PositionsPage', () => {
  beforeEach(() => {
    vi.mocked(organizationApi.positions).mockResolvedValue({
      items: [{ id: 'position-1', code: 'CV', name: 'Chuyên viên', level: 10, status: 'ACTIVE' }],
      page: 1, limit: 20, total: 1,
    });
  });

  it('labels and explains the organizational rank column', async () => {
    render(<MemoryRouter><PositionsPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { level: 1, name: 'Quản lý chức danh' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Thêm chức danh' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Danh sách chức danh' })).toBeVisible();
    expect(await screen.findByRole('columnheader', { name: /Thứ bậc/ })).toBeVisible();
    expect(screen.getByTitle('Chỉ dùng để sắp xếp chức danh, không đại diện cho quyền hệ thống.')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: 'Cấp' })).not.toBeInTheDocument();
  });
});
