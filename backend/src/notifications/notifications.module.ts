// Module notifications — FCM + APNs (Phase 10 + Phase 14).
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { FcmProvider } from './fcm/fcm.provider';
import { ApnsProvider } from './apns/apns.provider';

@Module({
  providers: [NotificationsService, FcmProvider, ApnsProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
