import React from 'react';
import { render as testingRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemConfirmDialogProvider } from '../../../components/system-confirm-dialog';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BSC_PRIMARY_GOAL_GROUP_CODE } from '../constants/employee-bsc.constants';
import { BscGoalGroup, BscItem, BscScoringPreview } from '../types/employee-bsc.types';
import { BscItemTable } from './bsc-item-table';

const render = (ui: React.ReactElement) => testingRender(ui, { wrapper: SystemConfirmDialogProvider });

vi.mock('../services/employee-bsc.service', () => ({
  employeeBscApi: {
    createItem: vi.fn(),
    updateItem: vi.fn(),
    updateActual: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

const goalGroups: BscGoalGroup[] = [
  { code: 'COMMON', marker: 'A', name: 'Mục tiêu chung', displayOrder: 1 },
  { code: 'UNIT_PROFESSIONAL', marker: 'B', name: 'Mục tiêu chuyên môn của đơn vị', displayOrder: 2 },
  { code: 'IMPORTANT_URGENT', marker: '1', name: 'Nhóm mục tiêu quan trọng và cấp bách', displayOrder: 3 },
  { code: 'IMPORTANT_OR_URGENT', marker: '2', name: 'Nhóm mục tiêu quan trọng/hoặc cấp bách', displayOrder: 4 },
  { code: 'ROUTINE', marker: '3', name: 'Nhóm mục tiêu thường xuyên', displayOrder: 5 },
];

describe('BscItemTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the fixed BSC objective groups without an editable objective field', () => {
    render(<BscItemTable bscId="bsc-1" goalGroups={goalGroups} items={[]} scoring={null} canManage canUpdateActual={false} onChange={vi.fn()}/>);

    for (const group of goalGroups) {
      expect(screen.getByRole('rowheader', { name: new RegExp(group.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
      const addButton = screen.queryByRole('button', { name: `Thêm KPI vào ${group.name}` });
      if (group.code === BSC_PRIMARY_GOAL_GROUP_CODE) expect(addButton).not.toBeInTheDocument();
      else expect(addButton).toBeVisible();
    }
    expect(screen.queryByRole('textbox', { name: /mục tiêu BSC/i })).not.toBeInTheDocument();
  });

  it('adds a custom KPO and KPI from the plus button of the selected group', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    vi.mocked(employeeBscApi.createItem).mockResolvedValue({} as never);

    render(<BscItemTable bscId="bsc-1" goalGroups={goalGroups} items={[]} scoring={null} canManage canUpdateActual={false} onChange={onChange}/>);

    await user.click(screen.getByRole('button', { name: 'Thêm KPI vào Nhóm mục tiêu quan trọng và cấp bách' }));
    const form = screen.getByRole('form', { name: 'Thêm KPI vào Nhóm mục tiêu quan trọng và cấp bách' });
    await user.type(within(form).getByRole('textbox', { name: 'Mục tiêu chiến lược (KPO)' }), 'Nâng cao chất lượng{Enter}phục vụ');
    await user.type(within(form).getByRole('textbox', { name: 'Đo lường hiệu suất (KPI)' }), 'Tỷ lệ hồ sơ đúng hạn{Enter}Không có hồ sơ trễ');
    expect(within(form).getByRole('textbox', { name: 'Đơn vị tính' })).toBeDisabled();
    expect(within(form).getByRole('textbox', { name: 'Đơn vị tính' })).toHaveValue('%');
    expect(within(form).getByRole('spinbutton', { name: 'Chỉ tiêu' })).toHaveValue(100);
    await user.type(within(form).getByRole('spinbutton', { name: 'Tỷ trọng (%)' }), '20');
    expect(within(form).getByRole('textbox', { name: 'Tần suất đo' })).toBeDisabled();
    expect(within(form).getByRole('textbox', { name: 'Tần suất đo' })).toHaveValue('Tháng');
    expect(within(form).queryByLabelText('Cách tính')).not.toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Lưu KPI' }));

    await waitFor(() => expect(employeeBscApi.createItem).toHaveBeenCalledWith('bsc-1', expect.objectContaining({
      kpiCode: expect.stringMatching(/^KPI-/),
      goalGroupCode: 'IMPORTANT_URGENT',
      description: 'Nâng cao chất lượng\nphục vụ',
      kpiName: 'Tỷ lệ hồ sơ đúng hạn\nKhông có hồ sơ trễ',
      measurementUnit: '%',
      targetValue: 100,
      weight: 20,
      measurementFrequency: 'Tháng',
      calculationMethod: 'ACTUAL_DIV_TARGET',
      sortOrder: 0,
    })));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('numbers KPI rows hierarchically within groups 1, 2 and 3', () => {
    const item = (id: string, goalGroupCode: string, sortOrder: number): BscItem => ({
      id,
      employee_bsc_id: 'bsc-1',
      goal_group_code: goalGroupCode,
      kpi_code: id,
      kpi_name: `KPI ${id}`,
      description: null,
      measurement_unit: '%',
      measurement_frequency: 'Tháng',
      target_value: '100',
      target_text: null,
      actual_value: null,
      actual_text: null,
      employee_note: null,
      weight: '10',
      calculation_method: 'ACTUAL_DIV_TARGET',
      sort_order: sortOrder,
    });

    render(<BscItemTable
      bscId="bsc-1"
      goalGroups={goalGroups}
      items={[
        item('KPI-1-A', 'IMPORTANT_URGENT', 0),
        item('KPI-1-B', 'IMPORTANT_URGENT', 1),
        item('KPI-2-A', 'IMPORTANT_OR_URGENT', 2),
      ]}
      scoring={null}
      canManage={false}
      canUpdateActual={false}
      onChange={vi.fn()}
    />);

    expect(screen.getByText('1.1')).toBeVisible();
    expect(screen.getByText('1.2')).toBeVisible();
    expect(screen.getByText('2.1')).toBeVisible();
  });

  it('recalculates the combined A and B KPI weight and shows whether it is ready to submit', () => {
    const item = (id: string, goalGroupCode: string, weight: string): BscItem => ({
      id,
      employee_bsc_id: 'bsc-1',
      goal_group_code: goalGroupCode,
      kpi_code: id,
      kpi_name: `KPI ${id}`,
      description: null,
      measurement_unit: '%',
      measurement_frequency: 'Tháng',
      target_value: '100',
      target_text: null,
      actual_value: null,
      actual_text: null,
      employee_note: null,
      weight,
      calculation_method: 'ACTUAL_DIV_TARGET',
      sort_order: 0,
    });
    const itemsWithRoutineWeight = (routineWeight: string) => [
      item('A-1', 'COMMON', '10'),
      item('B-0', 'UNIT_PROFESSIONAL', '10'),
      item('B-1', 'IMPORTANT_URGENT', '20'),
      item('B-2', 'IMPORTANT_OR_URGENT', '20'),
      item('B-3', 'ROUTINE', routineWeight),
    ];
    const { rerender } = render(<BscItemTable
      bscId="bsc-1"
      goalGroups={goalGroups}
      items={itemsWithRoutineWeight('15')}
      scoring={null}
      canManage
      canUpdateActual={false}
      onChange={vi.fn()}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('Tổng tỷ trọng A + B: 75%');
    expect(screen.getByRole('status')).toHaveTextContent('Còn thiếu 25%');
    const expectGroupWeight = (name: RegExp, weight: string) => {
      const groupHeader = screen.getByRole('rowheader', { name });
      expect(groupHeader).toHaveAttribute('colspan', '4');
      const weightCell = groupHeader.nextElementSibling;
      expect(weightCell).toHaveTextContent(weight);
      expect(weightCell).toHaveClass('bg-primary/10', 'font-bold');
    };
    expectGroupWeight(/Mục tiêu chung/, '10%');
    expectGroupWeight(/Mục tiêu chuyên môn của đơn vị/, '65%');
    expectGroupWeight(/Nhóm mục tiêu quan trọng và cấp bách/, '20%');
    expectGroupWeight(/Nhóm mục tiêu quan trọng\/hoặc cấp bách/, '20%');
    expectGroupWeight(/Nhóm mục tiêu thường xuyên/, '15%');

    rerender(<BscItemTable
      bscId="bsc-1"
      goalGroups={goalGroups}
      items={itemsWithRoutineWeight('40')}
      scoring={null}
      canManage
      canUpdateActual={false}
      onChange={vi.fn()}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('Tổng tỷ trọng A + B: 100%');
    expect(screen.getByRole('status')).toHaveTextContent('Đủ điều kiện tỷ trọng để nộp');

    rerender(<BscItemTable
      bscId="bsc-1"
      goalGroups={goalGroups}
      items={itemsWithRoutineWeight('39.99999')}
      scoring={null}
      canManage
      canUpdateActual={false}
      onChange={vi.fn()}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('Tổng tỷ trọng A + B: 99.99999%');
    expect(screen.getByRole('status')).toHaveTextContent('Còn thiếu 0.00001%');
    expect(screen.getByRole('status')).not.toHaveTextContent('Đủ điều kiện tỷ trọng để nộp');

    rerender(<BscItemTable
      bscId="bsc-1"
      goalGroups={goalGroups}
      items={itemsWithRoutineWeight('40.01')}
      scoring={null}
      canManage
      canUpdateActual={false}
      onChange={vi.fn()}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('Tổng tỷ trọng A + B: 100.01%');
    expect(screen.getByRole('status')).toHaveTextContent('Đang vượt 0.01%');
  });

  it('shows the calculated evaluation score and grade at the bottom of the BSC table', () => {
    const item: BscItem = {
      id: 'KPI-1', employee_bsc_id: 'bsc-1', goal_group_code: 'COMMON', kpi_code: 'KPI-1',
      kpi_name: 'KPI mẫu', description: 'Mục tiêu mẫu', measurement_unit: '%', measurement_frequency: 'Tháng',
      target_value: '100', target_text: null, actual_value: '92', actual_text: null, employee_note: 'Hoàn thành',
      weight: '100', calculation_method: 'ACTUAL_DIV_TARGET', sort_order: 0,
    };
    const scoring: BscScoringPreview = {
      bscId: 'bsc-1', planStatus: 'APPROVED', evaluationStatus: 'DRAFT', totalWeight: 100, scoredWeight: 100,
      totalWeightedScore: 90, isComplete: true, classification: 'A',
      items: [{
        itemId: 'KPI-1', calculationMethod: 'ACTUAL_DIV_TARGET', target: 100, actual: 92, weight: 100,
        isScorable: true, reason: null, rawAchievementPercentage: 92, roundedAchievementPercentage: 92,
        rawWorkScore: 92, roundedWorkScore: 90, weightedScore: 90,
      }],
    };

    render(<BscItemTable bscId="bsc-1" goalGroups={goalGroups} items={[item]} scoring={scoring} canManage={false} canUpdateActual onChange={vi.fn()}/>);

    const header = screen.getByRole('row', { name: /STT/ });
    expect(within(header).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'STT', 'Mục tiêu chiến lược (KPO)', 'Đo lường hiệu suất (KPI)', 'ĐVT', 'Chỉ tiêu', '% Tỷ trọng',
      'Tần suất đo', 'Kết quả thực hiện', 'Tỉ lệ hoàn thành', 'Điểm công việc', 'Điểm trọng số', 'TM KQTH', 'Thao tác',
    ]);
    expect(screen.getByRole('row', { name: /1 Mục tiêu mẫu KPI mẫu % 100 100% Tháng 92 92% 90 90 Hoàn thành Nhập kết quả/ })).toBeVisible();
    expect(screen.queryByText('KPI-1')).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /ĐIỂM ĐÁNH GIÁ DỰ KIẾN 90/ })).toBeVisible();
    expect(screen.getByRole('row', { name: /LOẠI THÀNH TÍCH DỰ KIẾN A/ })).toBeVisible();
  });

  it('preserves line breaks in multiline BSC content after loading saved data', () => {
    const item: BscItem = {
      id: 'KPI-MULTILINE', employee_bsc_id: 'bsc-1', goal_group_code: 'COMMON', kpi_code: 'KPI-MULTILINE',
      kpi_name: 'Điều kiện 1\nĐiều kiện 2', description: 'Mục tiêu 1\nMục tiêu 2',
      measurement_unit: '%', measurement_frequency: 'Tháng',
      target_value: '100', target_text: null, actual_value: null, actual_text: null,
      employee_note: 'Kết quả 1\nKết quả 2', weight: '100',
      calculation_method: 'ACTUAL_DIV_TARGET', sort_order: 0,
    };

    render(<BscItemTable bscId="bsc-1" goalGroups={goalGroups} items={[item]} scoring={null} canManage={false} canUpdateActual={false} onChange={vi.fn()}/>);

    const kpoCell = screen.getByRole('cell', { name: /^Mục tiêu 1\s+Mục tiêu 2$/ });
    const kpiCell = screen.getByRole('cell', { name: /^Điều kiện 1\s+Điều kiện 2$/ });
    const noteCell = screen.getByRole('cell', { name: /^Kết quả 1\s+Kết quả 2$/ });
    expect(kpoCell.textContent).toBe('Mục tiêu 1\nMục tiêu 2');
    expect(kpoCell).toHaveClass('whitespace-pre-wrap');
    expect(kpiCell.textContent).toBe('Điều kiện 1\nĐiều kiện 2');
    expect(kpiCell).toHaveClass('whitespace-pre-wrap');
    expect(noteCell.textContent).toBe('Kết quả 1\nKết quả 2');
    expect(noteCell).toHaveClass('whitespace-pre-wrap');
  });

  it('refreshes the evaluation score and grade after saving a KPI result', async () => {
    const user = userEvent.setup();
    const item: BscItem = {
      id: 'KPI-1', employee_bsc_id: 'bsc-1', goal_group_code: 'COMMON', kpi_code: 'KPI-1',
      kpi_name: 'KPI mẫu', description: 'Mục tiêu mẫu', measurement_unit: '%', measurement_frequency: 'Tháng',
      target_value: '100', target_text: null, actual_value: null, actual_text: null, employee_note: null,
      weight: '100', calculation_method: 'ACTUAL_DIV_TARGET', sort_order: 0,
    };
    const incomplete: BscScoringPreview = {
      bscId: 'bsc-1', planStatus: 'APPROVED', evaluationStatus: 'DRAFT', totalWeight: 100, scoredWeight: 0,
      totalWeightedScore: 0, isComplete: false, classification: null,
      items: [{ itemId: 'KPI-1', calculationMethod: 'ACTUAL_DIV_TARGET', target: 100, actual: null, weight: 100,
        isScorable: false, reason: 'ACTUAL_NOT_PROVIDED', rawAchievementPercentage: null, roundedAchievementPercentage: null,
        rawWorkScore: null, roundedWorkScore: null, weightedScore: null }],
    };
    const complete: BscScoringPreview = {
      ...incomplete, scoredWeight: 100, totalWeightedScore: 90, isComplete: true, classification: 'A',
      items: [{ itemId: 'KPI-1', calculationMethod: 'ACTUAL_DIV_TARGET', target: 100, actual: 92, weight: 100,
        isScorable: true, reason: null, rawAchievementPercentage: 92, roundedAchievementPercentage: 92,
        rawWorkScore: 92, roundedWorkScore: 90, weightedScore: 90 }],
    };
    vi.mocked(employeeBscApi.updateActual).mockResolvedValue({} as never);

    const Harness = () => {
      const [preview, setPreview] = React.useState(incomplete);
      return <BscItemTable bscId="bsc-1" goalGroups={goalGroups} items={[item]} scoring={preview} canManage={false} canUpdateActual onChange={async () => setPreview(complete)}/>;
    };
    render(<Harness/>);

    expect(screen.getByRole('row', { name: /LOẠI THÀNH TÍCH DỰ KIẾN Chưa đủ dữ liệu/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nhập kết quả' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Kết quả thực hiện' }), '92');
    await user.type(screen.getByRole('textbox', { name: 'TM KQTH' }), 'Hoàn thành{Enter}Đúng tiến độ');
    await user.click(screen.getByRole('button', { name: 'Lưu kết quả' }));

    await waitFor(() => expect(employeeBscApi.updateActual).toHaveBeenCalledWith('bsc-1', 'KPI-1', { actualValue: 92, employeeNote: 'Hoàn thành\nĐúng tiến độ' }));
    expect(screen.getByRole('row', { name: /ĐIỂM ĐÁNH GIÁ DỰ KIẾN 90/ })).toBeVisible();
    expect(screen.getByRole('row', { name: /LOẠI THÀNH TÍCH DỰ KIẾN A/ })).toBeVisible();
  });
});
