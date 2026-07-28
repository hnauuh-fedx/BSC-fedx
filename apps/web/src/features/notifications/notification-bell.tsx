import React from 'react';
import { BellIcon, CheckCheckIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../components/ui/empty';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '../../components/ui/popover';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';
import { Skeleton } from '../../components/ui/skeleton';
import { NotificationFeed } from './notification-feed';
import { useNotificationCenter } from './notification-center';
import { NotificationItem } from './notifications.types';

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const { items, unreadCount, loading, error, refresh, markRead, markAllRead } = useNotificationCenter();

  const select = async (item: NotificationItem) => {
    if (!item.readAt) await markRead(item.id).catch(() => undefined);
    setOpen(false);
    navigate(item.targetPath);
  };

  return <Popover open={open} onOpenChange={(nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) void refresh();
  }}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="relative" aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}>
        <BellIcon data-icon="inline-start" aria-hidden="true" />
        {unreadCount > 0 && <Badge className="absolute -right-1 -top-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-[26rem] gap-0 overflow-hidden p-0">
      <PopoverHeader className="px-4 py-3">
        <PopoverTitle>Thông báo</PopoverTitle>
        <PopoverDescription>{unreadCount ? `${unreadCount} thông báo chưa đọc` : 'Bạn đã đọc tất cả thông báo'}</PopoverDescription>
      </PopoverHeader>
      <Separator />
      <ScrollArea className="h-[24rem]">
        {loading ? <div className="flex flex-col gap-3 p-4" role="status">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <span className="sr-only">Đang tải thông báo…</span>
        </div> : error && items.length === 0 ? <div className="p-4"><Alert variant="destructive">
          <AlertTitle>Không thể tải thông báo</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert></div>
          : items.length === 0 ? <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><BellIcon aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>Chưa có thông báo</EmptyTitle>
              <EmptyDescription>Các cập nhật về BSC sẽ xuất hiện tại đây.</EmptyDescription>
            </EmptyHeader>
          </Empty> : <NotificationFeed items={items} onSelect={select} compact />}
      </ScrollArea>
      <Separator />
      <div className="flex items-center justify-between gap-2 p-2">
        <Button variant="ghost" size="sm" disabled={unreadCount === 0} onClick={() => void markAllRead()}>
          <CheckCheckIcon data-icon="inline-start" />Đọc tất cả
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); navigate('/notifications'); }}>
          Xem tất cả
        </Button>
      </div>
    </PopoverContent>
  </Popover>;
};
