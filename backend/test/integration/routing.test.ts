// Test de routage — verrouille le fix P0 (audit 2026-08-01).
//
// Le bug : `setGlobalPrefix('v1')` sans exclusion renommait le gateway
// GraphQL en /v1/v2/graphql, alors que le client mobile appelle
// /v2/graphql (404 en production — les tests du service ne voient
// jamais le routage). On boote l'app RÉELLE via configureApp() (la
// même fonction que main.ts) et on vérifie que :
//   * /v2/graphql EXISTE (tout statut sauf 404 — gardé/flag/validation) ;
//   * /v1/v2/graphql N'EXISTE PAS (404) ;
//   * les routes v1 restent préfixées (/v1/stats/me gardée, /stats/me 404).
//
// DRIZZLE est remplacé par un stub : aucune requête SQL ne part au boot
// (pg.Pool reste paresseuse, mais on n'a même pas besoin de la pool).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

// Env minimal pour les factories (aucune connexion n'est ouverte).
process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.GRAPHQL_ENABLED ??= 'true';

describe('routage global (configureApp)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    // configure-app.ts (PAS main.ts : bootstrap() démarrerait un
    // serveur réel dès l'import).
    const { configureApp } = await import('../../src/configure-app');
    const { DRIZZLE } = await import('../../src/db/database.module');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /v2/graphql est routé — tout statut SAUF 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/v2/graphql')
      .send({ query: 'query ViewerStats { viewerStats { period } }' });
    // Avant le fix : 404 (mappé /v1/v2/graphql). 401 = JwtGuard (routé,
    // gardé) ; 400 = validation ; 503 = flag OFF. Jamais 404.
    expect(res.status).not.toBe(404);
    expect([400, 401, 503]).toContain(res.status);
  });

  it('POST /v1/v2/graphql n\u2019existe PAS (forme du bug historique)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/v2/graphql')
      .send({ query: 'query X { y }' });
    expect(res.status).toBe(404);
  });

  it('routes v1 : /v1/stats/me gardée (401), /stats/me non préfixée est 404', async () => {
    const base = app.getHttpServer();
    const prefixed = await request(base).get('/v1/stats/me');
    expect([401, 200]).toContain(prefixed.status);
    const unprefixed = await request(base).get('/stats/me');
    expect(unprefixed.status).toBe(404);
  });
});
