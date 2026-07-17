import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PositionForm } from './position-form';

describe('PositionForm', () => {
  it('explains organizational rank and does not default a new position to 1', () => {
    render(<PositionForm onSubmit={vi.fn()} submitLabel="Tạo chức danh" />);

    expect(screen.getByRole('spinbutton', { name: 'Thứ bậc tổ chức' })).toHaveValue(null);
    expect(screen.getByPlaceholderText('Ví dụ: 10, 20, 30...')).toBeVisible();
    expect(screen.getByText('Số càng lớn thể hiện chức danh có thứ bậc tổ chức cao hơn. Giá trị này chỉ dùng để sắp xếp, không tự động cấp quyền.')).toBeVisible();
  });

  it.each([
    ['', 'Vui lòng nhập thứ bậc tổ chức.'],
    ['1.5', 'Thứ bậc tổ chức phải là số nguyên.'],
    ['-1', 'Thứ bậc tổ chức phải nằm trong khoảng từ 1 đến 999.'],
    ['0', 'Thứ bậc tổ chức phải nằm trong khoảng từ 1 đến 999.'],
    ['1000', 'Thứ bậc tổ chức phải nằm trong khoảng từ 1 đến 999.'],
  ])('rejects invalid organizational rank %s', async (level, message) => {
    const user = userEvent.setup();
    render(<PositionForm onSubmit={vi.fn()} submitLabel="Tạo chức danh" initialValues={{ code: 'CV', name: 'Chuyên viên', level }} />);

    await user.click(screen.getByRole('button', { name: 'Tạo chức danh' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it.each(['1', '10', '100', '999'])('submits valid organizational rank %s once', async (level) => {
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

  it('resets a create form after a successful submit', async () => {
    const user = userEvent.setup();
    render(<PositionForm onSubmit={vi.fn().mockResolvedValue(undefined)} submitLabel="Tạo chức danh" resetOnSuccess initialValues={{ code: 'CV', name: 'Chuyên viên', level: '10' }} />);

    await user.click(screen.getByRole('button', { name: 'Tạo chức danh' }));
    expect(screen.getByRole('textbox', { name: 'Mã' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Tên' })).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Thứ bậc tổ chức' })).toHaveValue(null);
  });
});
