/// Point d'entrée — NestJS bootstrap.
///
/// ATTENTION : ce fichier appelle bootstrap() à l'import — ne JAMAIS
/// l'importer depuis un test (un second serveur réel écouterait sur le
/// port PORT/3000). La configuration HTTP partagée vit dans
/// ./configure-app.ts, sans effet de bord.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MedAnki DZ API listening on :${port}/v1 · graphql :${port}/v2/graphql`);
  // eslint-disable-next-line no-console
  console.log(`metrics scrape :${port}/v1/metrics`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bootstrap failed', err);
  process.exit(1);
});
