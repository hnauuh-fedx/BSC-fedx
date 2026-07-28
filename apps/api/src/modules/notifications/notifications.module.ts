import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationPublisher } from './notifications.publisher';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationPublisher],
  exports: [NotificationPublisher],
})
export class NotificationsModule {}

