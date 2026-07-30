import { Module } from '@nestjs/common';
import { SrsSyncService } from './srs-sync.service';
import { SrsSyncController } from './srs-sync.controller';

@Module({
  providers: [SrsSyncService],
  controllers: [SrsSyncController],
  exports: [SrsSyncService],
})
export class SrsSyncModule {}
