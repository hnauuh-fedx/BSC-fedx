import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('Dialog stacking', () => {
  it('keeps both overlay and content above sticky table headers', () => {
    render(
      <>
        <table>
          <thead>
            <tr><th>Kỳ</th></tr>
          </thead>
        </table>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Sao chép BSC</DialogTitle>
          </DialogContent>
        </Dialog>
      </>,
    );

    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass('z-50');
    expect(screen.getByRole('dialog')).toHaveClass('z-50');
  });
});
