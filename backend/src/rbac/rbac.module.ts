import { Global, Module } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';

@Global()
@Module({
  providers: [RbacGuard],
  exports: [RbacGuard],
})
export class RbacModule {}
