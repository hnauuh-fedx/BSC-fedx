import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { notificationsApi } from './notifications-api';
import { NotificationItem } from './notifications.types';

interface NotificationCenterValue {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);
const PREVIEW_LIMIT = 8;
const POLL_INTERVAL_MS = 30_000;

export const NotificationCenterProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const page = await notificationsApi.list({ limit: PREVIEW_LIMIT });
      setItems(page.items);
      setUnreadCount(page.unreadCount);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải thông báo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    const updated = await notificationsApi.markRead(id);
    setItems((current) => current.map((item) => item.id === id ? updated : item));
    setUnreadCount((current) => Math.max(0, current - (items.find((item) => item.id === id)?.readAt ? 0 : 1)));
  }, [items]);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    setUnreadCount(0);
  }, []);

  const value = useMemo(() => ({
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
  }), [items, unreadCount, loading, error, refresh, markRead, markAllRead]);

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
};

export const useNotificationCenter = () => {
  const value = useContext(NotificationCenterContext);
  if (!value) throw new Error('useNotificationCenter must be used inside NotificationCenterProvider.');
  return value;
};

