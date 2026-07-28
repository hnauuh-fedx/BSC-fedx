import React, { useCallback, useEffect, useState } from 'react';
import { CheckCheckIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../organization/management-ui';
import { NotificationFeed } from '../notification-feed';
import { useNotificationCenter } from '../notification-center';
import { notificationsApi } from '../notifications-api';
import { NotificationItem } from '../notifications.types';

type FeedFilter = 'all' | 'unread';
const PAGE_LIMIT = 20;

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const center = useNotificationCenter();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (cursor?: string | null) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const page = await notificationsApi.list({
        cursor,
        limit: PAGE_LIMIT,
        unreadOnly: filter === 'unread',
      });
      setItems((current) => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải thông báo.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const select = async (item: NotificationItem) => {
    if (!item.readAt) {
      await center.markRead(item.id).catch(() => undefined);
      setItems((current) => filter === 'unread'
        ? current.filter((currentItem) => currentItem.id !== item.id)
        : current.map((currentItem) => currentItem.id === item.id
          ? { ...currentItem, readAt: new Date().toISOString() }
          : currentItem));
      setUnreadCount((current) => Math.max(0, current - 1));
    }
    navigate(item.targetPath);
  };

  const markAllRead = async () => {
    await center.markAllRead();
    setUnreadCount(0);
    setItems((current) => filter === 'unread'
      ? []
      : current.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }));
  };

  return <main className="flex flex-col gap-5">
    <PageHeader
      title="Thông báo"
      description="Theo dõi các lần nộp, duyệt, trả lại và mở lại BSC của bạn."
      action={<Button variant="outline" disabled={unreadCount === 0} onClick={() => void markAllRead()}>
        <CheckCheckIcon data-icon="inline-start" />Đánh dấu tất cả đã đọc
      </Button>}
    />
    <Card>
      <CardHeader>
        <CardTitle>Hộp thư thông báo</CardTitle>
        <CardDescription>{unreadCount ? `${unreadCount} thông báo chưa đọc` : 'Không còn thông báo chưa đọc'}</CardDescription>
        <CardAction>
          <Tabs value={filter} onValueChange={(value) => setFilter(value as FeedFilter)}>
            <TabsList aria-label="Lọc thông báo">
              <TabsTrigger value="all">Tất cả</TabsTrigger>
              <TabsTrigger value="unread">Chưa đọc</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {loading ? <LoadingState message="Đang tải thông báo…" />
          : error ? <div className="p-4"><ErrorState error={error} onRetry={() => void load()} /></div>
            : items.length === 0 ? <EmptyState message={filter === 'unread'
              ? 'Bạn đã đọc tất cả thông báo.'
              : 'Các cập nhật về BSC sẽ xuất hiện tại đây.'} />
              : <NotificationFeed items={items} onSelect={select} />}
      </CardContent>
      {nextCursor && <CardFooter className="justify-center">
        <Button variant="outline" disabled={loadingMore} onClick={() => void load(nextCursor)}>
          {loadingMore ? 'Đang tải…' : 'Tải thêm'}
        </Button>
      </CardFooter>}
    </Card>
  </main>;
};
