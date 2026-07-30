import { Module } from '@nestjs/common';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';

@Module({
  providers: [ShareService],
  controllers: [ShareController],
  exports: [ShareService],
})
export class ShareModule {}
