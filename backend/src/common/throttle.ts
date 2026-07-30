// Throttle configuration — `@nestjs/throttler`.
//
// Limites par catégorie (doc v2 §6.1) :
//   * OTP / magic-link : 5 tentatives par IP par 15 min
//   * Push SRS : 100 events max par batch (déjà au service, mais on
//                throttle aussi au niveau IP pour éviter l'abus)
//   * Auth général : 60 req/min par IP (anti-brute-force)
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';

export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'short',
      ttl: 1_000,
      limit: 10, // 10 req/s par IP
    },
    {
      name: 'medium',
      ttl: 60_000,
      limit: 60, // 60 req/min par IP
    },
    {
      name: 'long',
      ttl: 15 * 60_000,
      limit: 200, // 200 req/15min par IP
    },
  ],
};

export const ThrottlerModuleConfigured = ThrottlerModule.forRoot(throttlerConfig);
