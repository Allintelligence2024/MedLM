/// Test d'intégration — rotation du refresh token (audit P2-6).
///
/// Ce flux n'était couvert qu'en unitaire, alors qu'il traverse toute
/// la pile : garde `@Public()`, validation Zod, service, signature JWT.
/// Une erreur ici déconnecte l'ensemble du parc au bout de 15 minutes
/// (durée de vie de l'access token) — c'est la panne la plus visible
/// possible.
///
/// Comme pour srs-sync : app RÉELLE bootée via configureApp(), `DRIZZLE`
/// remplacé par un fake (aucune connexion PostgreSQL).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';

describe('POST /v1/auth/refresh (intégration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/configure-app');
    const { DRIZZLE, DRIZZLE_READ } = await import(
      '../../src/db/database.module'
    );

    // Fake minimal : toute requête renvoie une liste vide, donc aucun
    // refresh token n'est reconnu. C'est exactement ce qu'on veut
    // vérifier ici — le REFUS doit être propre (401), jamais une 500
    // ni un jeton émis par erreur.
    //
    // La chaîne est à la fois un tableau ET un thenable : les services
    // écrivent tantôt `await db.select().from(t).where(c)`, tantôt
    // `.then((rows) => rows[0])`. Un simple tableau ferait échouer la
    // seconde forme avec un TypeError transformé en HTTP 500 — on
    // testerait alors le fake, pas le produit.
    const emptyChain = (): any => {
      const rows: any[] = [];
      const chain: any = Object.assign(rows, {
        where: () => emptyChain(),
        limit: () => emptyChain(),
        orderBy: () => emptyChain(),
        from: () => emptyChain(),
        leftJoin: () => emptyChain(),
        innerJoin: () => emptyChain(),
        groupBy: () => emptyChain(),
        then: (resolve: (v: any[]) => unknown) => Promise.resolve(resolve([])),
      });
      return chain;
    };
    const fakeDb: any = {
      select: () => emptyChain(),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'device-1' }],
          onConflictDoUpdate: () => ({ returning: async () => [{}] }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve(undefined)),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(resolve(undefined)),
          }),
        }),
      }),
      delete: () => ({ where: async () => [] }),
      execute: async () => ({ rows: [] }),
      transaction: async (fn: any) => fn(fakeDb),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(fakeDb)
      .overrideProvider(DRIZZLE_READ)
      .useValue(fakeDb)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('la route est publique : elle répond sans Authorization', async () => {
    // Un JwtGuard posé par erreur sur /auth/refresh rendrait le
    // renouvellement impossible dès l'expiration de l'access token —
    // panne totale et silencieuse.
    const res = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('X-Platform', 'mobile')
      .send({ refresh_token: 'jeton-inconnu-mais-bien-forme' });
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });

  it('refuse un corps sans refresh_token (400, pas 500)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('X-Platform', 'mobile')
      .send({});
    expect(res.status).toBe(400);
  });

  it('refuse un refresh_token du mauvais type', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('X-Platform', 'mobile')
      .send({ refresh_token: 12345 });
    expect(res.status).toBe(400);
  });

  it('un jeton inconnu est refusé — jamais de nouvelle paire émise', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('X-Platform', 'mobile')
      .send({ refresh_token: 'a'.repeat(64) });
    expect([400, 401]).toContain(res.status);
    expect(res.body?.access_token).toBeUndefined();
    expect(res.body?.refresh_token).toBeUndefined();
  });

  it('aucune réponse d\'erreur ne divulgue de jeton ou de secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('X-Platform', 'mobile')
      .send({ refresh_token: 'b'.repeat(64) });
    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain('bbbbbbbb');
    expect(body).not.toContain('private');
    expect(body).not.toContain('secret');
  });

  it('les endpoints d\'auth sont bien sous le préfixe v1', async () => {
    const unprefixed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: 'x'.repeat(64) });
    expect(unprefixed.status).toBe(404);
  });
});
