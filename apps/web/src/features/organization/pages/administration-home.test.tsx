import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdministrationHome } from './administration-home';

describe('AdministrationHome', () => {
  it('shows available administration destinations instead of an empty landing page', () => {
    render(<MemoryRouter><AdministrationHome permissions={['user.view', 'department.view', 'position.view', 'role.view', 'permission.view', 'bsc.period.view', 'bsc.template.view', 'audit.view']}/></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Quản trị hệ thống' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Người dùng' })).toHaveAttribute('href', '/management/users');
    expect(screen.getByRole('link', { name: 'Đơn vị' })).toHaveAttribute('href', '/management/departments');
    expect(screen.getByRole('link', { name: 'Chức danh' })).toHaveAttribute('href', '/management/positions');
    expect(screen.getByRole('link', { name: 'Kỳ BSC' })).toHaveAttribute('href', '/management/bsc-cycles');
    expect(screen.getByText('Mẫu BSC')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nhật ký hệ thống' })).toHaveAttribute('href', '/management/audit-logs');
  });

  it('honors independently assigned manage permissions', () => {
    render(<MemoryRouter><AdministrationHome permissions={['user.create', 'department.manage', 'permission.assign', 'bsc.period.manage']}/></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đơn vị' })).not.toBeInTheDocument();
    expect(screen.getByText('Thao tác người dùng')).toBeVisible();
    expect(screen.getByText('Quản lý đơn vị')).toBeVisible();
    expect(screen.getByText('Phân quyền')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Kỳ BSC' })).toHaveAttribute('href', '/management/bsc-cycles');
  });
});
