import { Module } from '@nestjs/common';
import { ErasureService } from './erasure.service';

@Module({
  providers: [ErasureService],
  exports: [ErasureService],
})
export class PrivacyModule {}
