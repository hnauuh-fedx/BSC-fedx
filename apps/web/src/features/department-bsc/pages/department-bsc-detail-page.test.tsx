import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemConfirmDialogProvider } from '../../../components/system-confirm-dialog';
import { useAuth } from '../../auth/hooks/use-auth';
import { bscCyclesApi } from '../../bsc-cycles';
import { DEPARTMENT_BSC_PERMISSIONS as P, departmentBscApi } from '../department-bsc.service';
import type { DepartmentBsc } from '../department-bsc.types';
import { DepartmentBscDetailPage } from './department-bsc-pages';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../../bsc-cycles', () => ({ bscCyclesApi: { open: vi.fn() } }));
vi.mock('../department-bsc.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../department-bsc.service')>();
  return {
    ...actual,
    departmentBscApi: {
      detail: vi.fn(),
      scoringPreview: vi.fn(),
      versions: vi.fn(),
    },
  };
});

const bsc = {
  id: 'department-bsc-1',
  bsc_code: 'DBSC_MKT_CE23CCEF16FC',
  cycle_id: 'cycle-1',
  department_id: 'department-1',
  responsible_manager_id: 'manager-1',
  reviewer_id: 'director-1',
  source_bsc_id: null,
  manager_comment: null,
  director_comment: null,
  plan_status: 'DRAFT',
  evaluation_status: 'NOT_STARTED',
  plan_submitted_at: null,
  plan_approved_at: null,
  evaluation_submitted_at: null,
  evaluation_approved_at: null,
  total_score: 0,
  final_score: null,
  final_grade: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  bsc_cycles: { id: 'cycle-1', code: 'T7', name: 'Tháng 7/2026', year: 2026, month: 7, status: 'OPEN' },
  departments: { id: 'department-1', code: 'MKT', name: 'Marketing' },
  responsible_manager: { id: 'manager-1', employee_code: 'M001', full_name: 'Trưởng phòng Marketing' },
  reviewer: { id: 'director-1', employee_code: 'D001', full_name: 'Giám đốc thử nghiệm' },
  department_bsc_items: [],
  department_bsc_status_histories: [],
  department_bsc_reviews: [],
  goal_groups: [],
} as DepartmentBsc;

describe('DepartmentBscDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { permissions: [P.VIEW] },
    } as ReturnType<typeof useAuth>);
    vi.mocked(departmentBscApi.detail).mockResolvedValue(bsc);
    vi.mocked(departmentBscApi.scoringPreview).mockResolvedValue({
      bscId: bsc.id,
      planStatus: 'DRAFT',
      evaluationStatus: 'NOT_STARTED',
      totalWeight: 0,
      scoredWeight: 0,
      totalWeightedScore: 0,
      isComplete: false,
      classification: null,
      items: [],
    });
    vi.mocked(bscCyclesApi.open).mockResolvedValue([]);
  });

  it('hiển thị phòng ban và kỳ thay cho mã BSC kỹ thuật', async () => {
    render(
      <SystemConfirmDialogProvider>
        <MemoryRouter initialEntries={['/department-bsc/department-bsc-1']}>
          <Routes>
            <Route path="/department-bsc/:id" element={<DepartmentBscDetailPage />} />
          </Routes>
        </MemoryRouter>
      </SystemConfirmDialogProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'BSC Marketing · Tháng 7/2026' }),
    ).toBeVisible();
    expect(screen.queryByText('DBSC_MKT_CE23CCEF16FC')).not.toBeInTheDocument();
    expect(screen.getByText('Trưởng phòng: Trưởng phòng Marketing')).toBeVisible();
  });
});
