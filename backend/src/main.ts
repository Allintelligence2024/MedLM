/// Point d'entrée — NestJS bootstrap (Phase 12 : intercepteur métriques).
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { MetricsService } from './observability/metrics.service';
import { HttpMetricsInterceptor } from './observability/metrics.interceptor';
import { SentryService } from './observability/sentry.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: false });
  app.setGlobalPrefix('v1');

  // Phase 12 : intercepteur métriques (latence + erreurs par route).
  const metrics = app.get(MetricsService);
  app.useGlobalInterceptors(new HttpMetricsInterceptor(metrics));

  // Phase 12 : Sentry (no-op si SENTRY_DSN absent).
  app.get(SentryService);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MedAnki DZ API listening on :${port}/v1`);
  // eslint-disable-next-line no-console
  console.log(`metrics scrape :${port}/v1/metrics`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bootstrap failed', err);
  process.exit(1);
});
