import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PositionForm } from './position-form';

describe('PositionForm', () => {
  it('lets users choose a clearly titled organizational rank', async () => {
    const user = userEvent.setup();
    render(<PositionForm onSubmit={vi.fn()} submitLabel="Tạo chức danh" />);

    const rankSelect = screen.getByRole('combobox', { name: 'Thứ bậc tổ chức' });
    expect(rankSelect).toHaveTextContent('Chọn thứ bậc phù hợp');
    expect(screen.getByText('Số càng lớn thể hiện chức danh có thứ bậc tổ chức cao hơn. Giá trị này chỉ dùng để sắp xếp, không tự động cấp quyền.')).toBeVisible();

    rankSelect.focus();
    await user.keyboard('{ArrowDown}');
    const firstRank = screen.getByRole('option', { name: 'Bậc 1 — Nhân viên / Chuyên viên' });
    expect(firstRank).toHaveAttribute('title', 'Phù hợp với các chức danh thực thi công việc chuyên môn.');
    expect(screen.getByRole('option', { name: 'Bậc 7 — Lãnh đạo cấp cao' })).toHaveAttribute('title', 'Phù hợp với chức danh lãnh đạo cấp cao nhất trong cơ cấu.');
    await user.click(firstRank);
    expect(rankSelect).toHaveTextContent('Bậc 1 — Nhân viên / Chuyên viên');
  });

  it('requires an organizational rank selection', async () => {
    const user = userEvent.setup();
    render(<PositionForm onSubmit={vi.fn()} submitLabel="Tạo chức danh" initialValues={{ code: 'CV', name: 'Chuyên viên', level: '' }} />);

    await user.click(screen.getByRole('button', { name: 'Tạo chức danh' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng chọn thứ bậc tổ chức.');
  });

  it.each(['10', '40', '70'])('submits selected organizational rank %s once', async (level) => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve; }));
    render(<PositionForm onSubmit={onSubmit} submitLabel="Tạo chức danh" initialValues={{ code: ' cv ', name: ' Chuyên viên ', level }} />);

    const button = screen.getByRole('button', { name: 'Tạo chức danh' });
    await user.dblClick(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ code: 'CV', name: 'Chuyên viên', level: Number(level) });
    expect(button).toBeDisabled();
    resolveSubmit();
  });

  it('preserves a legacy organizational rank while editing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PositionForm onSubmit={onSubmit} submitLabel="Lưu" initialValues={{ code: 'CV', name: 'Chuyên viên', level: '1' }} />);

    expect(screen.getByRole('combobox', { name: 'Thứ bậc tổ chức' })).toHaveTextContent('Bậc hiện tại — 1');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(onSubmit).toHaveBeenCalledWith({ code: 'CV', name: 'Chuyên viên', level: 1 });
  });

  it('resets a create form after a successful submit', async () => {
    const user = userEvent.setup();
    render(<PositionForm onSubmit={vi.fn().mockResolvedValue(undefined)} submitLabel="Tạo chức danh" resetOnSuccess initialValues={{ code: 'CV', name: 'Chuyên viên', level: '10' }} />);

    await user.click(screen.getByRole('button', { name: 'Tạo chức danh' }));
    expect(screen.getByRole('textbox', { name: 'Mã' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Tên' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Thứ bậc tổ chức' })).toHaveTextContent('Chọn thứ bậc phù hợp');
  });
});
