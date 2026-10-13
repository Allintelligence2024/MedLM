// CacheModule — Redis connecté AVANT injection du budget gateway (R04).
import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { RedisCache } from './redis-cache';

export const REDIS_CACHE = RedisCache;

async function buildRedisCache(): Promise<RedisCache> {
  const cache = new RedisCache(process.env.REDIS_URL, {
    defaultTtlSeconds: 60,
    keyPrefix: 'medanki:',
  });
  await cache.connect();
  return cache;
}

@Injectable()
class RedisCacheShutdown implements OnModuleDestroy {
  constructor(@Inject(RedisCache) private readonly cache: RedisCache) {}
  async onModuleDestroy(): Promise<void> {
    await this.cache.close();
  }
}

@Global()
@Module({
  providers: [
    { provide: RedisCache, useFactory: buildRedisCache },
    RedisCacheShutdown,
  ],
  exports: [RedisCache],
})
export class CacheModule {}
