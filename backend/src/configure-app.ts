/// Configuration HTTP de l'application — partagée entre le bootstrap
/// de production (main.ts) et les tests d'intégration.
///
/// EXTRAITE de main.ts : main.ts appelle bootstrap() à l'import, donc
/// l'importer depuis un test démarrait un second serveur réel sur le
/// port 3000 (EADDRINUSE). Ce module n'a AUCUN effet de bord.
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { MetricsService } from './observability/metrics.service';
import { HttpMetricsInterceptor } from './observability/metrics.interceptor';
import { SentryService } from './observability/sentry.service';
import { ZodExceptionFilter } from './common/zod-exception.filter';

/// Configuration HTTP commune à bootstrap() ET aux tests (routing,
/// srs-sync) — extraite pour qu'aucune dérive ne puisse réintroduire
/// un écart prod/test.
///
/// BUG CORRIGÉ (P0, audit 2026-08-01) : `setGlobalPrefix('v1')` sans
/// exclusion renommait le gateway GraphQL `@Controller('v2/graphql')`
/// en **/v1/v2/graphql** alors que le client mobile et la doc ciblent
/// **/v2/graphql** (404 en production). v2 est désormais exclu
/// explicitement du préfixe global — verrouillé par
/// test/integration/routing.test.ts.
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // ZodError brute → 400 (et non 500) — voir zod-exception.filter.ts.
  app.useGlobalFilters(new ZodExceptionFilter());
  app.enableCors({ origin: false });
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'v2/graphql', method: RequestMethod.ALL }],
  });

  // Phase 12 : intercepteur métriques (latence + erreurs par route).
  const metrics = app.get(MetricsService);
  app.useGlobalInterceptors(new HttpMetricsInterceptor(metrics));

  // Phase 12 : Sentry (no-op si SENTRY_DSN absent).
  app.get(SentryService);
}
