import { httpClient } from '../../lib/http-client';
import { NotificationItem, NotificationPage, NotificationQuery } from './notifications.types';

const queryString = (query: NotificationQuery) => {
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.unreadOnly) params.set('unreadOnly', 'true');
  const value = params.toString();
  return value ? `?${value}` : '';
};

export const notificationsApi = {
  list: (query: NotificationQuery = {}) =>
    httpClient.get<NotificationPage>(`/notifications${queryString(query)}`),
  unreadCount: () =>
    httpClient.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) =>
    httpClient.patch<NotificationItem>(`/notifications/${id}/read`, {}),
  markAllRead: () =>
    httpClient.patch<{ updated: number }>('/notifications/read-all', {}),
};

