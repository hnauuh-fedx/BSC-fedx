import React, { Fragment } from 'react';
import { CheckCircle2Icon, ClipboardCheckIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '../../components/ui/item';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { NotificationItem } from './notifications.types';

const notificationIcon = (type: string) => {
  if (type.includes('REOPEN')) return RotateCcwIcon;
  if (type.endsWith('_RETURNED') || type.endsWith('_REJECTED')) return Undo2Icon;
  if (type.endsWith('_APPROVED')) return CheckCircle2Icon;
  return ClipboardCheckIcon;
};

const notificationTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

export const NotificationFeed: React.FC<{
  items: NotificationItem[];
  onSelect: (item: NotificationItem) => void;
  compact?: boolean;
}> = ({ items, onSelect, compact = false }) => (
  <ItemGroup className="gap-0">
    {items.map((item, index) => {
      const Icon = notificationIcon(item.type);
      return <Fragment key={item.id}>
        <Item asChild variant={item.readAt ? 'default' : 'muted'} size={compact ? 'sm' : 'default'}>
          <button
            type="button"
            className={cn('cursor-pointer flex-nowrap text-left', compact ? 'rounded-none px-4 py-3' : 'py-4')}
            onClick={() => onSelect(item)}
          >
            <ItemMedia variant="icon" className={cn(
              'size-9 rounded-full border',
              item.readAt ? 'bg-background text-muted-foreground' : 'bg-primary/10 text-primary',
            )}>
              <Icon aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <div className="flex items-start justify-between gap-4">
                <ItemTitle className={cn('line-clamp-2', !item.readAt && 'font-semibold')}>{item.title}</ItemTitle>
                {!item.readAt && <Badge variant="secondary">Chưa đọc</Badge>}
              </div>
              <ItemDescription>{item.message}</ItemDescription>
              <span className="text-xs text-muted-foreground">{notificationTime(item.createdAt)}</span>
            </ItemContent>
          </button>
        </Item>
        {index < items.length - 1 && <ItemSeparator className="my-0" />}
      </Fragment>;
    })}
  </ItemGroup>
);
