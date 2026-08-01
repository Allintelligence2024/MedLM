/// Test d'intégration — webhook Chargily (audit P2-6).
///
/// Pourquoi ce flux mérite un test d'intégration et pas seulement des
/// tests unitaires : il est le seul endpoint **public non authentifié
/// qui accorde des droits payants**. Trois choses ne peuvent être
/// vérifiées qu'à travers la pile HTTP complète :
///   1. la route est bien publique (un JwtGuard ici casserait tous les
///      paiements — Chargily n'a pas de JWT) ;
///   2. une signature absente ou fausse n'accorde RIEN ;
///   3. le corps brut est disponible pour la vérification HMAC (un
///      `bodyParser` qui ne conserverait pas le raw body invaliderait
///      toutes les signatures — panne silencieuse et totale).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
// Sans secret configuré, le provider journalise et refuse de vérifier :
// c'est le comportement à tester (aucun droit accordé par défaut).
delete process.env.CHARGILY_API_SECRET;

const VALID_EVENT = {
  id: 'evt_integration_1',
  type: 'checkout.paid',
  data: {
    id: 'co_integration_1',
    amount: 1200,
    currency: 'dzd',
    status: 'paid',
    metadata: { user_id: '11111111-1111-1111-1111-111111111111', plan: 'premium' },
  },
};

describe('POST /v1/billing/webhook/chargily (intégration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/configure-app');
    const { DRIZZLE, DRIZZLE_READ } = await import(
      '../../src/db/database.module'
    );

    const chain = (): any => {
      const rows: any[] = [];
      return Object.assign(rows, {
        where: () => chain(),
        limit: () => chain(),
        orderBy: () => chain(),
        from: () => chain(),
        then: (resolve: (v: any[]) => unknown) => Promise.resolve(resolve([])),
      });
    };
    const fakeDb: any = {
      select: () => chain(),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'row-1' }],
          onConflictDoNothing: () => ({ returning: async () => [] }),
          onConflictDoUpdate: () => ({ returning: async () => [{}] }),
          then: (r: (v: unknown) => unknown) => Promise.resolve(r(undefined)),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
            then: (r: (v: unknown) => unknown) => Promise.resolve(r(undefined)),
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

  it('la route existe et est PUBLIQUE (pas de 401/404 sans JWT)', async () => {
    // Chargily n'envoie aucun jeton : un garde ici couperait tous les
    // encaissements.
    const res = await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .send(VALID_EVENT);
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(401);
  });

  it('sans signature : rien n\'est accordé', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .send(VALID_EVENT);
    expect(res.status).toBe(200); // on répond 200 pour éviter les retries
    expect(res.body.processed).toBe(false);
    expect(res.body.reason).toBe('bad_signature');
  });

  it('avec une signature fausse : rien n\'est accordé', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .set('signature', 'deadbeef'.repeat(8))
      .send(VALID_EVENT);
    expect(res.body.processed).toBe(false);
    expect(res.body.reason).toBe('bad_signature');
  });

  it('la signature est refusée AVANT toute lecture du corps', async () => {
    // Un corps volontairement invalide (Zod le rejetterait en 400) doit
    // tout de même sortir en `bad_signature` : la vérification passe
    // en premier, donc un attaquant ne peut pas sonder le schéma.
    const res = await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .send({ n_importe_quoi: true });
    expect(res.status).toBe(200);
    expect(res.body.reason).toBe('bad_signature');
  });

  it('l\'endpoint de checkout, lui, EXIGE un JWT', async () => {
    // Symétrie du point précédent : le webhook est public, la création
    // de session de paiement ne l'est pas.
    const res = await request(app.getHttpServer())
      .post('/v1/billing/checkout')
      .send({ plan: 'premium' });
    expect(res.status).toBe(401);
  });

  it('l\'entitlement exige un JWT', async () => {
    const res = await request(app.getHttpServer()).get('/v1/billing/entitlement');
    expect(res.status).toBe(401);
  });

  it('la réponse ne divulgue ni secret ni détail interne', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .send(VALID_EVENT);
    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain('secret');
    expect(body).not.toContain('api_key');
    expect(body).not.toContain('stack');
  });
});
