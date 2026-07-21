import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bscCyclesApi } from '../../bsc-cycles';
import { useAuth } from '../../auth/hooks/use-auth';
import { DEPARTMENT_BSC_PERMISSIONS as P, departmentBscApi } from '../department-bsc.service';
import type { DepartmentBsc } from '../department-bsc.types';
import { DepartmentBscListPage } from './department-bsc-pages';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../../bsc-cycles', () => ({ bscCyclesApi: { open: vi.fn() } }));
vi.mock('../department-bsc.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../department-bsc.service')>();
  return {
    ...actual,
    departmentBscApi: {
      list: vi.fn(),
      export: vi.fn(),
      duplicate: vi.fn(),
    },
  };
});

const bsc = {
  id: 'department-bsc-1', cycle_id: 'cycle-1', plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED',
  final_score: null, final_grade: null,
  bsc_cycles: { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' },
  departments: { id: 'department-1', code: 'MKT', name: 'Marketing' },
} as DepartmentBsc;

const LocationProbe = () => <output aria-label="current-location">{useLocation().pathname}</output>;

const renderPage = () => render(<MemoryRouter><DepartmentBscListPage/><LocationProbe/></MemoryRouter>);

describe('DepartmentBscListPage actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { permissions: [P.VIEW, P.DUPLICATE, P.EXPORT] },
    } as ReturnType<typeof useAuth>);
    vi.mocked(departmentBscApi.list).mockResolvedValue({ items: [bsc], page: 1, limit: 20, total: 1 });
    vi.mocked(bscCyclesApi.open).mockResolvedValue([
      { id: 'cycle-1', name: 'Tháng 7/2026' },
      { id: 'cycle-2', name: 'Tháng 8/2026' },
    ] as Awaited<ReturnType<typeof bscCyclesApi.open>>);
    vi.mocked(departmentBscApi.export).mockResolvedValue({ blob: new Blob(['excel']), fileName: 'bsc-phong-ban.xlsx' });
    vi.mocked(departmentBscApi.duplicate).mockResolvedValue({ ...bsc, id: 'department-bsc-2', cycle_id: 'cycle-2' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:department-bsc') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('shows detail, Excel export and duplicate actions when permissions allow them', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/department-bsc/department-bsc-1');
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sao chép BSC' })).toBeVisible();
  });

  it('hides Excel export and duplicate actions without their permissions', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { permissions: [P.VIEW] } } as ReturnType<typeof useAuth>);

    renderPage();

    expect(await screen.findByText(/7\/2026/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sao ch.*BSC/ })).not.toBeInTheDocument();
  });

  it('downloads the department BSC Excel file', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(departmentBscApi.export).toHaveBeenCalledWith('department-bsc-1'));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    const clickedAnchor = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0] as HTMLAnchorElement;
    expect(clickedAnchor.href).toBe('blob:department-bsc');
    expect(clickedAnchor.download).toBe('bsc-phong-ban.xlsx');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:department-bsc');
  });

  it('duplicates into a selected open cycle and opens the new BSC', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Sao chép BSC' }));
    expect(await screen.findByRole('dialog', { name: 'Sao chép BSC phòng ban' })).toBeVisible();
    await userEvent.click(screen.getByRole('combobox', { name: 'Kỳ đích' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tháng 8/2026' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận sao chép' }));

    await waitFor(() => expect(departmentBscApi.duplicate).toHaveBeenCalledWith('department-bsc-1', 'cycle-2'));
    expect(screen.getByLabelText('current-location')).toHaveTextContent('/department-bsc/department-bsc-2');
  });
});
