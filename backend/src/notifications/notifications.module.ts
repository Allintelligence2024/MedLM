// Module notifications — FCM + APNs (Phase 10 + Phase 14 + audit P1-3).
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { FcmProvider } from './fcm/fcm.provider';
import { ApnsProvider } from './apns/apns.provider';
import { DeviceTokensService } from './device-tokens.service';
import { DeviceTokensController } from './device-tokens.controller';

@Module({
  controllers: [DeviceTokensController],
  providers: [
    NotificationsService,
    FcmProvider,
    ApnsProvider,
    DeviceTokensService,
  ],
  exports: [NotificationsService, DeviceTokensService],
})
export class NotificationsModule {}
