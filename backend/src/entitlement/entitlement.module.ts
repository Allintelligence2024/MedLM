import { Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { EntitlementController } from './entitlement.controller';

@Module({
  providers: [EntitlementService],
  controllers: [EntitlementController],
  exports: [EntitlementService],
})
export class EntitlementModule {}
