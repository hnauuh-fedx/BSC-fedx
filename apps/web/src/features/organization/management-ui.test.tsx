import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '../../components/ui/button';
import { BscStatusBadge } from '../employee-bsc/components/bsc-status-badge';
import { AccessibleDialog, EmptyState, ErrorState, FormField, LoadingState } from './management-ui';

describe('shared accessible UI', () => {
  it('gives an icon-only button an accessible name', () => {
    render(<Button size="icon" aria-label="Đóng hộp thoại"><span aria-hidden="true">×</span></Button>);
    expect(screen.getByRole('button', { name: 'Đóng hộp thoại' })).toBeVisible();
  });

  it('announces a dialog title, moves focus inside, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [open, setOpen] = useState(false); const triggerRef = useRef<HTMLButtonElement>(null);
      return <><button ref={triggerRef} onClick={() => setOpen(true)}>Mở duyệt</button>
        <AccessibleDialog open={open} title="Duyệt BSC" description="Xác nhận duyệt nội dung BSC." onClose={() => setOpen(false)} returnFocusRef={triggerRef}>
          <button>Xác nhận</button><button>Hủy</button>
        </AccessibleDialog></>;
    };
    render(<Harness/>); const trigger = screen.getByRole('button', { name: 'Mở duyệt' }); await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Duyệt BSC' });
    expect(dialog).toHaveAccessibleDescription('Xác nhận duyệt nội dung BSC.');
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });

  it('links a field error to its input', () => {
    render(<FormField label="Mã KPI" error="Mã KPI là bắt buộc"><input /></FormField>);
    const input = screen.getByRole('textbox', { name: 'Mã KPI' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Mã KPI là bắt buộc');
  });

  it('renders textual status and meaningful loading, error, and empty states', () => {
    render(<><BscStatusBadge status="SUBMITTED"/><LoadingState/><ErrorState error="Không thể tải dữ liệu."/><EmptyState message="Chưa có KPI."/></>);
    expect(screen.getByText('Chờ duyệt')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu.');
    expect(screen.getByText('Chưa có KPI.')).toBeVisible();
  });
});
