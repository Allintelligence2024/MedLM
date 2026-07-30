import { Module } from '@nestjs/common';
import { GroupPacksService } from './group-packs.service';
import { GroupPacksController } from './group-packs.controller';

@Module({
  providers: [GroupPacksService],
  controllers: [GroupPacksController],
  exports: [GroupPacksService],
})
export class GroupPacksModule {}
