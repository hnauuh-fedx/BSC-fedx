import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MainLayout } from '../../app/layouts/main-layout';
import { useAuth } from '../auth/hooks/use-auth';

vi.mock('../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));

describe('department manager navigation', () => {
  it('shows the department BSC workspace when the manager permission is present', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'manager-1', employeeCode: 'TP001', fullName: 'Trưởng phòng', email: 'manager@example.test',
        status: 'ACTIVE', departmentId: 'department-1', positionId: 'position-1', directManagerId: 'director-1',
        roles: [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: 'department-1', permissions: ['bsc.department.view'] }],
        permissions: ['bsc.department.view', 'bsc.department.create'],
      },
      logout: vi.fn(),
    } as never);

    render(<MemoryRouter><MainLayout><p>Nội dung</p></MainLayout></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'BSC phòng ban' })).toHaveAttribute('href', '/department-bsc');
  });
});
