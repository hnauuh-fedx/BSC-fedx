import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SystemConfirmDialogProvider, useSystemConfirm } from './system-confirm-dialog';

const Example = () => {
  const confirm = useSystemConfirm();
  const [result, setResult] = useState('Chưa chọn');
  return <>
    <button type="button" onClick={async () => {
      const accepted = await confirm({
        title: 'Gửi duyệt kết quả?',
        description: 'Kết quả sẽ bị khóa trong thời gian chờ xét duyệt.',
        confirmLabel: 'Gửi duyệt',
      });
      setResult(accepted ? 'Đã xác nhận' : 'Đã hủy');
    }}>Mở xác nhận</button>
    <output>{result}</output>
  </>;
};

describe('SystemConfirmDialogProvider', () => {
  it('hiển thị popup dùng chung và trả về true khi xác nhận', async () => {
    const user = userEvent.setup();
    render(<SystemConfirmDialogProvider><Example /></SystemConfirmDialogProvider>);

    await user.click(screen.getByRole('button', { name: 'Mở xác nhận' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Gửi duyệt kết quả?' });
    expect(dialog).toHaveTextContent('Kết quả sẽ bị khóa trong thời gian chờ xét duyệt.');
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    expect(screen.getByText('Đã xác nhận')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('trả về false khi đóng bằng nút Hủy', async () => {
    const user = userEvent.setup();
    render(<SystemConfirmDialogProvider><Example /></SystemConfirmDialogProvider>);

    await user.click(screen.getByRole('button', { name: 'Mở xác nhận' }));
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(screen.getByText('Đã hủy')).toBeVisible();
  });
});
