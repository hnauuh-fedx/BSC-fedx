import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bscCyclesApi } from '..';
import { BscCycleFormPage } from './bsc-cycle-pages';

vi.mock('../../auth/hooks/use-auth', () => ({ useAuth: () => ({ user: { permissions: ['bsc.period.manage'] } }) }));
vi.mock('..', () => ({ bscCyclesApi: { create: vi.fn(), update: vi.fn(), detail: vi.fn() } }));

describe('BscCycleFormPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a cycle without a planned end date or evaluation deadline', async () => {
    vi.mocked(bscCyclesApi.create).mockResolvedValue({ id: 'cycle-1' } as never);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/management/bsc-cycles/new']}><Routes><Route path="/management/bsc-cycles/new" element={<BscCycleFormPage />} /><Route path="/management/bsc-cycles/:id" element={<p>Chi tiết kỳ</p>} /></Routes></MemoryRouter>);

    expect(screen.queryByLabelText('Ngày kết thúc')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hạn đánh giá|Hạn nộp kết quả đánh giá/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Mã kỳ'), 'T7');
    await user.type(screen.getByLabelText('Tên kỳ'), 'BSC tháng 7');
    await user.clear(screen.getByLabelText('Năm'));
    await user.type(screen.getByLabelText('Năm'), '2026');
    await user.type(screen.getByLabelText('Tháng'), '7');
    await user.type(screen.getByLabelText('Ngày bắt đầu'), '2026-07-01');
    await user.click(screen.getByRole('button', { name: 'Lưu kỳ' }));

    expect(bscCyclesApi.create).toHaveBeenCalledWith({ code: 'T7', name: 'BSC tháng 7', cycleType: 'MONTH', year: 2026, month: 7, startDate: '2026-07-01' });
    expect(await screen.findByText('Chi tiết kỳ')).toBeVisible();
  });
});
