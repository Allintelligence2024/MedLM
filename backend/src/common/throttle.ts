// Throttle configuration — `@nestjs/throttler`.
//
// Un guard GLOBAL (ThrottlerGuard) est enregistré dans app.module.ts via
// APP_GUARD : sans ça, ces limites ne s'appliquent JAMAIS (les throttlers
// nommés exigent un `@Throttle()` explicite sur chaque route). On garde
// donc un throttler par défaut qui s'applique à toutes les routes, plus
// des throttlers nommés pour durcir certains endpoints si besoin.
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
// Limites par catégorie (doc v2 §6.1) :
//   * global : 120 req/min par IP (anti-brute-force général)
//   * medium : 60 req/min par IP
//   * long   : 200 req/15min par IP
export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      // Throttler par défaut (sans nom) : appliqué par le guard global.
      ttl: 60_000,
      limit: 120,
    },
    {
      name: 'medium',
      ttl: 60_000,
      limit: 60,
    },
    {
      name: 'long',
      ttl: 15 * 60_000,
      limit: 200,
    },
  ],
};

export const ThrottlerModuleConfigured = ThrottlerModule.forRoot(throttlerConfig);
