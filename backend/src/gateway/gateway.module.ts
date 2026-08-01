// GatewayModule — Phase 20.2 (GraphQL gateway, opérations persistées).
import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { REST_BACKEND, LoopbackRestBackend } from './rest-backend.port';
import { RedisCache } from '../cache/redis-cache';
import { COST_BUDGET_STORE } from './cost-budget.tokens';
import {
  InMemoryCostBudgetStore,
  RedisCostBudgetStore,
  type CostBudgetStore,
} from './cost-budget.store';

@Module({
  controllers: [GatewayController],
  providers: [
    GatewayService,
    {
      provide: REST_BACKEND,
      useFactory: () =>
        new LoopbackRestBackend(Number(process.env.PORT ?? 3000)),
    },
    {
      // Audit P2-2 : le budget vivait dans une Map d'instance, donc le
      // budget réel valait N × 500/h à N pods. Dès que Redis est
      // disponible, le compteur devient global — sans configuration
      // supplémentaire.
      provide: COST_BUDGET_STORE,
      inject: [RedisCache],
      useFactory: (cache: RedisCache): CostBudgetStore =>
        cache.client
          ? new RedisCostBudgetStore(cache.client)
          : new InMemoryCostBudgetStore(),
    },
  ],
})
export class GatewayModule {}
