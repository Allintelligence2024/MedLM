// GatewayModule — Phase 20.2 (GraphQL gateway, opérations persistées).
import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { REST_BACKEND, LoopbackRestBackend } from './rest-backend.port';

@Module({
  controllers: [GatewayController],
  providers: [
    GatewayService,
    {
      provide: REST_BACKEND,
      useFactory: () =>
        new LoopbackRestBackend(Number(process.env.PORT ?? 3000)),
    },
  ],
})
export class GatewayModule {}
