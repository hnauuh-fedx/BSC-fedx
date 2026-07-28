import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  entity_type: true,
  entity_id: true,
  target_path: true,
  metadata: true,
  read_at: true,
  created_at: true,
  actor: { select: { id: true, full_name: true } },
} satisfies Prisma.notificationsSelect;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(recipientId: string, query: QueryNotificationsDto) {
    const where: Prisma.notificationsWhereInput = {
      recipient_id: recipientId,
      ...(query.unreadOnly ? { read_at: null } : {}),
    };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notifications.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
      }),
      this.prisma.notifications.count({ where: { recipient_id: recipientId, read_at: null } }),
    ]);
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => this.present(row));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null, unreadCount };
  }

  async unreadCount(recipientId: string) {
    return { count: await this.prisma.notifications.count({ where: { recipient_id: recipientId, read_at: null } }) };
  }

  async markRead(recipientId: string, id: string) {
    const notification = await this.prisma.notifications.findFirst({ where: { id, recipient_id: recipientId } });
    if (!notification) this.notFound();
    const row = notification.read_at
      ? await this.prisma.notifications.findUniqueOrThrow({ where: { id }, select: notificationSelect })
      : await this.prisma.notifications.update({ where: { id }, data: { read_at: new Date() }, select: notificationSelect });
    return this.present(row);
  }

  async markAllRead(recipientId: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { recipient_id: recipientId, read_at: null },
      data: { read_at: new Date() },
    });
    return { updated: result.count };
  }

  private present(row: Prisma.notificationsGetPayload<{ select: typeof notificationSelect }>) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      entityType: row.entity_type,
      entityId: row.entity_id,
      targetPath: row.target_path,
      metadata: row.metadata,
      readAt: row.read_at,
      createdAt: row.created_at,
      actor: row.actor ? { id: row.actor.id, fullName: row.actor.full_name } : null,
    };
  }

  private notFound(): never {
    throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Không tìm thấy thông báo.' });
  }
}
