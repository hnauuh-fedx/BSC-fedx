import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationPublisher } from './notifications.publisher';
import { NotificationsService } from './notifications.service';
import { BscReviewersModule } from '../bsc-reviewers/bsc-reviewers.module';

@Module({
  imports: [AuthModule, BscReviewersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationPublisher],
  exports: [NotificationPublisher],
})
export class NotificationsModule {}
