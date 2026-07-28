import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './notification-bell';
import { NotificationCenterProvider } from './notification-center';
import { notificationsApi } from './notifications-api';
import { NotificationItem } from './notifications.types';

vi.mock('./notifications-api', () => ({
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const mockedApi = vi.mocked(notificationsApi);
const item: NotificationItem = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'EMPLOYEE_BSC_PLAN_APPROVED',
  title: 'Kế hoạch BSC đã được duyệt',
  message: 'Kế hoạch BSC của Nguyễn Văn An đã được duyệt.',
  entityType: 'employee_bsc',
  entityId: '00000000-0000-4000-8000-000000000002',
  targetPath: '/employee-bsc/00000000-0000-4000-8000-000000000002',
  metadata: { stage: 'PLAN' },
  readAt: null,
  createdAt: '2026-07-28T02:00:00.000Z',
  actor: { id: 'manager-id', fullName: 'Quản lý' },
};

const Location: React.FC = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
};

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.list.mockResolvedValue({ items: [item], nextCursor: null, unreadCount: 1 });
    mockedApi.markRead.mockResolvedValue({ ...item, readAt: '2026-07-28T03:00:00.000Z' });
    mockedApi.markAllRead.mockResolvedValue({ updated: 1 });
  });

  it('shows the unread badge, opens the feed, marks an item read and navigates to its target', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationCenterProvider>
          <NotificationBell />
          <Location />
        </NotificationCenterProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Thông báo, 1 chưa đọc' }));
    expect(await screen.findByText('Kế hoạch BSC đã được duyệt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Kế hoạch BSC đã được duyệt/ }));
    expect(mockedApi.markRead).toHaveBeenCalledWith(item.id);
    expect(screen.getByTestId('location')).toHaveTextContent(item.targetPath);
  });

  it('marks all preview items as read', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationCenterProvider><NotificationBell /></NotificationCenterProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' }));
    await user.click(screen.getByRole('button', { name: 'Đọc tất cả' }));
    expect(mockedApi.markAllRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Bạn đã đọc tất cả thông báo')).toBeInTheDocument());
  });
});
