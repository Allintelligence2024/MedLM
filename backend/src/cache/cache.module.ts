// CacheModule — Phase 18.
//
// Expose `RedisCache` comme provider injectable. En production,
// configuré avec REDIS_URL. En dev/test, mode no-op mémoire.
//
// À câbler dans `app.module.ts` et utiliser dans StatsService,
// LeaderboardService, JwtGuard (rate limiting), etc.
import { Global, Module } from '@nestjs/common';
import { RedisCache } from './redis-cache';

@Global()
@Module({
  providers: [
    {
      provide: RedisCache,
      useFactory: () => new RedisCache(process.env.REDIS_URL, {
        defaultTtlSeconds: 60,
        keyPrefix: 'medanki:',
      }),
    },
  ],
  exports: [RedisCache],
})
export class CacheModule {}
