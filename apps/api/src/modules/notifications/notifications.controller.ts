import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: QueryNotificationsDto) {
    return this.service.list(actor.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: AuthUser) {
    return this.service.unreadCount(actor.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() actor: AuthUser) {
    return this.service.markAllRead(actor.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.markRead(actor.id, id);
  }
}

