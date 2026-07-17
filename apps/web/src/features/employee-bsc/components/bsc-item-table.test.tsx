import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscItemTable } from './bsc-item-table';

vi.mock('../services/employee-bsc.service', () => ({
  employeeBscApi: {
    createItem: vi.fn(),
    updateItem: vi.fn(),
    updateActual: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

describe('BscItemTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets the BSC owner add a KPO and KPI to an empty draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    vi.mocked(employeeBscApi.createItem).mockResolvedValue({} as never);

    render(<BscItemTable bscId="bsc-1" items={[]} scoring={null} canManage canUpdateActual={false} onChange={onChange}/>);

    expect(screen.getByRole('heading', { name: 'Thêm mục tiêu BSC' })).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Mã KPI' }), 'KPI-01');
    await user.type(screen.getByRole('textbox', { name: 'Mục tiêu chiến lược (KPO)' }), 'Nâng cao chất lượng phục vụ');
    await user.type(screen.getByRole('textbox', { name: 'Đo lường hiệu suất (KPI)' }), 'Tỷ lệ hồ sơ đúng hạn');
    await user.type(screen.getByRole('textbox', { name: 'Đơn vị tính' }), '%');
    await user.type(screen.getByRole('spinbutton', { name: 'Chỉ tiêu' }), '95');
    await user.type(screen.getByRole('spinbutton', { name: 'Tỷ trọng (%)' }), '20');
    await user.click(screen.getByRole('button', { name: 'Thêm KPI vào BSC' }));

    await waitFor(() => expect(employeeBscApi.createItem).toHaveBeenCalledWith('bsc-1', expect.objectContaining({
      kpiCode: 'KPI-01',
      description: 'Nâng cao chất lượng phục vụ',
      kpiName: 'Tỷ lệ hồ sơ đúng hạn',
      measurementUnit: '%',
      targetValue: 95,
      weight: 20,
      calculationMethod: 'ACTUAL_DIV_TARGET',
      sortOrder: 0,
    })));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
