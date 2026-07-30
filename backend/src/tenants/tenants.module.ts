import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController, PublicTenantController } from './tenants.controller';

@Module({
  providers: [TenantsService],
  controllers: [TenantsController, PublicTenantController],
  exports: [TenantsService],
})
export class TenantsModule {}
